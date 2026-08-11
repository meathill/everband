import { env } from "cloudflare:test";
import {
  createLedgerEntryCore,
  getLedgerSummaryCore,
  listLedgerEntriesCore,
  updateLedgerEntryCore,
  voidLedgerEntryCore,
} from "@everband/core";
import { createDb, schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const db = createDb(env.DB);
const NOW = Date.parse("2026-08-11T08:00:00Z");

let sequence = 0;
function unique(prefix: string): string {
  sequence += 1;
  return `${prefix}-${NOW}-${sequence}-${Math.random().toString(36).slice(2, 6)}`;
}

async function seedOrg(): Promise<{ orgId: string; membershipId: string }> {
  const orgId = generateId(ID_PREFIXES.organization);
  const membershipId = generateId(ID_PREFIXES.membership);
  await db.insert(schema.organizations).values({
    id: orgId,
    name: unique("Org"),
    type: "band",
    timezone: "Australia/Sydney",
    currencyCode: "AUD",
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
  return { orgId, membershipId };
}

const BASE_QUERY = {
  page: 1,
  pageSize: 20,
  sort: "occurredOn",
  order: "desc" as const,
  direction: "all" as const,
  status: "posted" as const,
};

describe("轻量公费账本", () => {
  it("按有效收入减支出计算余额和本月净变化", async () => {
    const seeded = await seedOrg();
    await createLedgerEntryCore(
      db,
      seeded.orgId,
      {
        direction: "income",
        amountMinor: 125_00,
        occurredOn: "2026-08-03",
        category: "Fundraising",
        description: "Winter concert raffle",
      },
      seeded.membershipId,
      NOW,
    );
    await createLedgerEntryCore(
      db,
      seeded.orgId,
      {
        direction: "expense",
        amountMinor: 35_50,
        occurredOn: "2026-08-05",
        category: "Supplies",
      },
      seeded.membershipId,
      NOW,
    );
    await createLedgerEntryCore(
      db,
      seeded.orgId,
      {
        direction: "income",
        amountMinor: 20_00,
        occurredOn: "2026-07-28",
        category: "Donation",
      },
      seeded.membershipId,
      NOW,
    );

    expect(await getLedgerSummaryCore(db, seeded.orgId, "2026-08-01", "2026-09-01")).toEqual({
      balanceMinor: 109_50,
      monthIncomeMinor: 125_00,
      monthExpenseMinor: 35_50,
      monthNetMinor: 89_50,
    });
  });

  it("列表按组织隔离并支持方向、状态与文本筛选", async () => {
    const mine = await seedOrg();
    const other = await seedOrg();
    await createLedgerEntryCore(
      db,
      mine.orgId,
      {
        direction: "income",
        amountMinor: 50_00,
        occurredOn: "2026-08-08",
        category: "Donation",
        description: "Community grant",
      },
      mine.membershipId,
      NOW,
    );
    await createLedgerEntryCore(
      db,
      other.orgId,
      {
        direction: "income",
        amountMinor: 999_00,
        occurredOn: "2026-08-08",
        category: "Donation",
        description: "Other organization",
      },
      other.membershipId,
      NOW,
    );

    const result = await listLedgerEntriesCore(db, mine.orgId, {
      ...BASE_QUERY,
      direction: "income",
      q: "grant",
    });
    expect(result.total).toBe(1);
    expect(result.items[0]?.amountMinor).toBe(50_00);
  });

  it("编辑和作废均保留记录并写入审计，作废后不计入余额", async () => {
    const seeded = await seedOrg();
    const created = await createLedgerEntryCore(
      db,
      seeded.orgId,
      {
        direction: "expense",
        amountMinor: 10_00,
        occurredOn: "2026-08-09",
        category: "Supplies",
      },
      seeded.membershipId,
      NOW,
    );
    expect(
      (
        await updateLedgerEntryCore(
          db,
          seeded.orgId,
          created.entryId,
          { amountMinor: 12_50, description: "Music folders" },
          seeded.membershipId,
          NOW + 1,
        )
      ).ok,
    ).toBe(true);
    expect(
      (await voidLedgerEntryCore(db, seeded.orgId, created.entryId, seeded.membershipId, NOW + 2))
        .ok,
    ).toBe(true);

    const rows = await db
      .select({
        status: schema.ledgerEntries.status,
        amountMinor: schema.ledgerEntries.amountMinor,
      })
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.id, created.entryId));
    expect(rows[0]).toEqual({ status: "voided", amountMinor: 12_50 });
    expect(await getLedgerSummaryCore(db, seeded.orgId, "2026-08-01", "2026-09-01")).toEqual({
      balanceMinor: 0,
      monthIncomeMinor: 0,
      monthExpenseMinor: 0,
      monthNetMinor: 0,
    });

    const audits = await db
      .select({ action: schema.auditEntries.action })
      .from(schema.auditEntries)
      .where(
        and(
          eq(schema.auditEntries.organizationId, seeded.orgId),
          eq(schema.auditEntries.objectId, created.entryId),
        ),
      );
    expect(audits.map((row) => row.action)).toEqual([
      "ledger_entry.created",
      "ledger_entry.updated",
      "ledger_entry.voided",
    ]);
  });
});
