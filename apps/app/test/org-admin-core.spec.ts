import { env } from "cloudflare:test";
import { deleteTermCore, updateOrganizationCore, updateTermCore } from "@everband/core";
import { createDb, schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const db = createDb(env.DB);
const NOW = 1_754_600_000_000;

let seq = 0;
function unique(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}-${Math.random().toString(36).slice(2, 6)}`;
}

async function seed(): Promise<{ orgId: string; membershipId: string; termId: string }> {
  const orgId = generateId(ID_PREFIXES.organization);
  const membershipId = generateId(ID_PREFIXES.membership);
  const termId = generateId(ID_PREFIXES.term);
  await db.insert(schema.organizations).values({
    id: orgId,
    name: unique("Org"),
    type: "band",
    timezone: "Australia/Sydney",
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
  await db.insert(schema.terms).values({
    id: termId,
    organizationId: orgId,
    name: unique("Term"),
    startDate: "2026-01-01",
    endDate: "2026-03-31",
    createdAt: NOW,
  });
  return { orgId, membershipId, termId };
}

async function auditActions(orgId: string, objectId: string): Promise<string[]> {
  const rows = await db
    .select({ action: schema.auditEntries.action })
    .from(schema.auditEntries)
    .where(
      and(
        eq(schema.auditEntries.organizationId, orgId),
        eq(schema.auditEntries.objectId, objectId),
      ),
    );
  return rows.map((row) => row.action);
}

describe("updateOrganizationCore", () => {
  it("修改名称与时区但不重写历史时间，并记录审计", async () => {
    const seeded = await seed();
    const result = await updateOrganizationCore(
      db,
      seeded.orgId,
      { name: "Renamed Band", timezone: "Pacific/Auckland" },
      seeded.membershipId,
    );
    expect(result.ok).toBe(true);

    const rows = await db
      .select({ name: schema.organizations.name, timezone: schema.organizations.timezone })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, seeded.orgId));
    expect(rows[0]).toEqual({ name: "Renamed Band", timezone: "Pacific/Auckland" });
    expect(await auditActions(seeded.orgId, seeded.orgId)).toContain("organization.updated");
  });

  it("跨组织 id 不会修改其他组织", async () => {
    const seeded = await seed();
    const other = await seed();
    const result = await updateOrganizationCore(
      db,
      seeded.orgId,
      { name: "Safe" },
      other.membershipId,
    );
    expect(result.ok).toBe(true);
    const otherRows = await db
      .select({ name: schema.organizations.name })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, other.orgId));
    expect(otherRows[0]?.name).not.toBe("Safe");
  });
});

describe("term admin", () => {
  it("编辑学期、拒绝重名并记录审计", async () => {
    const seeded = await seed();
    const otherTermId = generateId(ID_PREFIXES.term);
    await db.insert(schema.terms).values({
      id: otherTermId,
      organizationId: seeded.orgId,
      name: "Existing Term",
      startDate: "2026-04-01",
      endDate: "2026-06-30",
      createdAt: NOW,
    });

    const updated = await updateTermCore(
      db,
      seeded.orgId,
      seeded.termId,
      { name: "Term One", startDate: "2026-01-15", endDate: "2026-04-01" },
      seeded.membershipId,
    );
    expect(updated.ok).toBe(true);
    expect(await auditActions(seeded.orgId, seeded.termId)).toContain("term.updated");

    const duplicate = await updateTermCore(
      db,
      seeded.orgId,
      seeded.termId,
      { name: "Existing Term" },
      seeded.membershipId,
    );
    expect(duplicate).toEqual({ ok: false, error: "A term with this name already exists." });
  });

  it("有排练引用时拒绝删除，无引用时删除并记录审计", async () => {
    const seeded = await seed();
    const seriesId = generateId(ID_PREFIXES.rehearsalSeries);
    await db.insert(schema.rehearsalSeries).values({
      id: seriesId,
      organizationId: seeded.orgId,
      termId: seeded.termId,
      weekday: 2,
      startTimeLocal: "18:00",
      endTimeLocal: "19:30",
      helpersNeeded: 1,
      isEnabled: true,
      createdAt: NOW,
    });

    expect(await deleteTermCore(db, seeded.orgId, seeded.termId, seeded.membershipId)).toEqual({
      ok: false,
      error: "This term still has rehearsals. Remove them before deleting the term.",
    });

    await db.delete(schema.rehearsalSeries).where(eq(schema.rehearsalSeries.id, seriesId));
    expect((await deleteTermCore(db, seeded.orgId, seeded.termId, seeded.membershipId)).ok).toBe(
      true,
    );
    expect(await auditActions(seeded.orgId, seeded.termId)).toContain("term.deleted");
  });
});
