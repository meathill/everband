import { env } from "cloudflare:test";
import {
  type AssetShortLinkService,
  createAssetCore,
  generateAssetQrCore,
  getPublicAssetCore,
  listAssetsCore,
  refreshAssetQrStatsCore,
  updateAssetCore,
  updateAssetStatusCore,
} from "@everband/core";
import { createDb, schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const db = createDb(env.DB);
const NOW = Date.parse("2026-08-13T08:00:00Z");

let sequence = 0;
function unique(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence}-${Math.random().toString(36).slice(2, 7)}`;
}

async function seedOrg(contactEmail: string | null = "equipment@test.local") {
  const orgId = generateId(ID_PREFIXES.organization);
  const membershipId = generateId(ID_PREFIXES.membership);
  const studentId = generateId(ID_PREFIXES.student);
  const householdId = generateId(ID_PREFIXES.household);
  await db.insert(schema.organizations).values({
    id: orgId,
    name: unique("Band"),
    type: "band",
    timezone: "Australia/Sydney",
    contactEmail,
    createdAt: NOW,
  });
  await db.insert(schema.memberships).values({
    id: membershipId,
    organizationId: orgId,
    role: "owner",
    status: "active",
    invitedEmail: `${unique("owner")}@test.local`,
    createdAt: NOW,
  });
  await db.insert(schema.households).values({
    id: householdId,
    organizationId: orgId,
    name: unique("Household"),
    createdAt: NOW,
  });
  await db.insert(schema.students).values({
    id: studentId,
    organizationId: orgId,
    householdId,
    name: "Amy Williams",
    status: "active",
    statusChangedAt: NOW,
    createdAt: NOW,
  });
  return { orgId, membershipId, studentId };
}

let qrSequence = 0;

class FakeShortLinkService implements AssetShortLinkService {
  createError: unknown;
  scanError: unknown;
  scanCount: number | null = 0;
  createdAliases: string[] = [];
  removedAliases: string[] = [];

  async createLink(): Promise<{ alias: string; shortUrl: string }> {
    if (this.createError) throw this.createError;
    qrSequence += 1;
    const alias = `asset-${qrSequence}`;
    this.createdAliases.push(alias);
    return { alias, shortUrl: `https://dyqr.me/${alias}` };
  }

  async removeLink(alias: string): Promise<void> {
    this.removedAliases.push(alias);
  }

  async getScanCount(): Promise<number | null> {
    if (this.scanError) throw this.scanError;
    return this.scanCount;
  }
}

const LIST_QUERY = {
  page: 1,
  pageSize: 20,
  sort: "name",
  order: "asc" as const,
  status: "all" as const,
};

describe("器材管理核心", () => {
  it("创建、查询和更新均按组织隔离，并拒绝跨组织持有人", async () => {
    const mine = await seedOrg();
    const other = await seedOrg();
    const created = await createAssetCore(
      db,
      mine.orgId,
      {
        name: "Alto saxophone",
        type: "Instrument",
        serialNumber: "AS-014",
        currentHolderStudentId: mine.studentId,
        notes: "Cupboard B",
      },
      mine.membershipId,
      NOW,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const mineList = await listAssetsCore(db, mine.orgId, { ...LIST_QUERY, q: "sax" });
    expect(mineList.total).toBe(1);
    expect(mineList.items[0]).toMatchObject({
      name: "Alto saxophone",
      currentHolderName: "Amy Williams",
      notes: "Cupboard B",
    });
    expect((await listAssetsCore(db, other.orgId, LIST_QUERY)).total).toBe(0);

    await expect(
      updateAssetCore(
        db,
        mine.orgId,
        created.assetId,
        { currentHolderStudentId: other.studentId },
        mine.membershipId,
        NOW + 1,
      ),
    ).resolves.toEqual({ ok: false, error: "Choose an active student from this organization." });

    const updated = await updateAssetCore(
      db,
      mine.orgId,
      created.assetId,
      { name: "Concert alto saxophone", notes: null },
      mine.membershipId,
      NOW + 2,
    );
    expect(updated.ok).toBe(true);
    const audits = await db
      .select({ action: schema.auditEntries.action })
      .from(schema.auditEntries)
      .where(
        and(
          eq(schema.auditEntries.organizationId, mine.orgId),
          eq(schema.auditEntries.objectId, created.assetId),
        ),
      );
    expect(audits.map((row) => row.action)).toEqual(["asset.created", "asset.updated"]);
  });

  it("dyqr 失败不回滚器材，重试成功且重复调用保持幂等", async () => {
    const seeded = await seedOrg();
    const created = await createAssetCore(
      db,
      seeded.orgId,
      { name: "Tuba", type: "Instrument" },
      seeded.membershipId,
      NOW,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const service = new FakeShortLinkService();
    service.createError = { kind: "quota" };
    const failed = await generateAssetQrCore(
      db,
      seeded.orgId,
      created.assetId,
      seeded.membershipId,
      "https://app.test",
      service,
      NOW + 1,
    );
    expect(failed).toEqual({
      ok: false,
      error: "The asset was saved, but the QR service plan limit was reached.",
    });
    expect((await listAssetsCore(db, seeded.orgId, LIST_QUERY)).items[0]?.qrCodeId).toBeNull();

    service.createError = undefined;
    const generated = await generateAssetQrCore(
      db,
      seeded.orgId,
      created.assetId,
      seeded.membershipId,
      "https://app.test",
      service,
      NOW + 2,
    );
    expect(generated).toMatchObject({ ok: true, changed: true });
    const repeated = await generateAssetQrCore(
      db,
      seeded.orgId,
      created.assetId,
      seeded.membershipId,
      "https://app.test",
      service,
      NOW + 3,
    );
    expect(repeated).toMatchObject({ ok: true, changed: false });
    expect(service.createdAliases).toHaveLength(1);
  });

  it("退役与恢复同步本地 QR 状态，公开路由只返回白名单", async () => {
    const seeded = await seedOrg();
    const created = await createAssetCore(
      db,
      seeded.orgId,
      {
        name: "Tenor saxophone",
        type: "Instrument",
        serialNumber: "TS-22",
        currentHolderStudentId: seeded.studentId,
        notes: "Private repair note",
      },
      seeded.membershipId,
      NOW,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const service = new FakeShortLinkService();
    await generateAssetQrCore(
      db,
      seeded.orgId,
      created.assetId,
      seeded.membershipId,
      "https://app.test",
      service,
      NOW + 1,
    );

    const publicAsset = await getPublicAssetCore(db, created.assetId);
    expect(publicAsset).toEqual({
      name: "Tenor saxophone",
      type: "Instrument",
      serialNumber: "TS-22",
      currentHolder: "Amy W.",
      organizationName: expect.any(String),
      contactEmail: "equipment@test.local",
    });
    expect(publicAsset).not.toHaveProperty("notes");

    await updateAssetStatusCore(
      db,
      seeded.orgId,
      created.assetId,
      "retired",
      seeded.membershipId,
      NOW + 2,
    );
    expect(await getPublicAssetCore(db, created.assetId)).toBeNull();
    expect((await listAssetsCore(db, seeded.orgId, LIST_QUERY)).items[0]?.qrStatus).toBe(
      "disabled",
    );

    await updateAssetStatusCore(
      db,
      seeded.orgId,
      created.assetId,
      "active",
      seeded.membershipId,
      NOW + 3,
    );
    expect((await listAssetsCore(db, seeded.orgId, LIST_QUERY)).items[0]?.qrStatus).toBe("active");
  });

  it("明确 404 才标记 broken，并能生成替代二维码", async () => {
    const seeded = await seedOrg();
    const created = await createAssetCore(
      db,
      seeded.orgId,
      { name: "Music stand", type: "Equipment" },
      seeded.membershipId,
      NOW,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const service = new FakeShortLinkService();
    await generateAssetQrCore(
      db,
      seeded.orgId,
      created.assetId,
      seeded.membershipId,
      "https://app.test",
      service,
      NOW + 1,
    );
    service.scanError = { kind: "unavailable" };
    expect(
      (
        await refreshAssetQrStatsCore(
          db,
          seeded.orgId,
          created.assetId,
          seeded.membershipId,
          service,
          NOW + 2,
        )
      ).ok,
    ).toBe(false);
    expect((await listAssetsCore(db, seeded.orgId, LIST_QUERY)).items[0]?.qrStatus).toBe("active");

    service.scanError = { kind: "not_found" };
    await refreshAssetQrStatsCore(
      db,
      seeded.orgId,
      created.assetId,
      seeded.membershipId,
      service,
      NOW + 3,
    );
    expect((await listAssetsCore(db, seeded.orgId, LIST_QUERY)).items[0]?.qrStatus).toBe("broken");

    service.scanError = undefined;
    const replacement = await generateAssetQrCore(
      db,
      seeded.orgId,
      created.assetId,
      seeded.membershipId,
      "https://app.test",
      service,
      NOW + 4,
    );
    expect(replacement).toMatchObject({ ok: true, changed: true });
    expect(service.createdAliases).toHaveLength(2);
    expect((await listAssetsCore(db, seeded.orgId, LIST_QUERY)).items[0]?.qrStatus).toBe("active");
  });
});
