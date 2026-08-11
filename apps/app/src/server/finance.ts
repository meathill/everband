import {
  createLedgerEntryCore,
  getLedgerSummaryCore,
  listLedgerEntriesCore,
  updateLedgerEntryCore,
  voidLedgerEntryCore,
} from "@everband/core";
import { schema } from "@everband/db";
import { currentMonthInTimezone } from "@everband/domain";
import {
  createLedgerEntrySchema,
  ledgerEntriesPageSchema,
  orgIdSchema,
  updateLedgerEntrySchema,
  voidLedgerEntrySchema,
} from "@everband/validation";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { getDb } from "./context.ts";
import { requireMembership, STAFF_ROLES } from "./guards.ts";

async function getFinanceOrganization(orgId: string) {
  const db = getDb();
  const rows = await db
    .select({
      currencyCode: schema.organizations.currencyCode,
      timezone: schema.organizations.timezone,
    })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, orgId))
    .limit(1);
  const organization = rows[0];
  if (!organization) throw new Error("Organization not found");
  return organization;
}

export const listLedgerEntries = createServerFn({ method: "GET" })
  .validator(ledgerEntriesPageSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    await requireMembership(db, data.orgId, STAFF_ROLES);
    const organization = await getFinanceOrganization(data.orgId);
    const month = currentMonthInTimezone(Date.now(), organization.timezone);
    const [year, monthNumber] = month.split("-").map(Number);
    const next = new Date(Date.UTC(year ?? 0, monthNumber ?? 1, 1));
    const nextMonthStart = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const [list, summary] = await Promise.all([
      listLedgerEntriesCore(db, data.orgId, data),
      getLedgerSummaryCore(db, data.orgId, `${month}-01`, nextMonthStart),
    ]);
    return { list, summary, currencyCode: organization.currencyCode, month };
  });

export const createLedgerEntry = createServerFn({ method: "POST" })
  .validator(createLedgerEntrySchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const { orgId, ...input } = data;
    return createLedgerEntryCore(db, orgId, input, ctx.membershipId, Date.now());
  });

export const updateLedgerEntry = createServerFn({ method: "POST" })
  .validator(updateLedgerEntrySchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const { orgId, entryId, ...input } = data;
    return updateLedgerEntryCore(db, orgId, entryId, input, ctx.membershipId, Date.now());
  });

export const voidLedgerEntry = createServerFn({ method: "POST" })
  .validator(voidLedgerEntrySchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    return voidLedgerEntryCore(db, data.orgId, data.entryId, ctx.membershipId, Date.now());
  });

export const getFinanceAccess = createServerFn({ method: "GET" })
  .validator(orgIdSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    await requireMembership(db, data.orgId, STAFF_ROLES);
    return { ok: true as const };
  });
