import type { Database } from "@everband/db";
import { schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
import type {
  CreateLedgerEntryInput,
  LedgerDirectionFilter,
  LedgerStatusFilter,
  ListResult,
  SortOrder,
  UpdateLedgerEntryInput,
} from "@everband/validation";
import { toOffset } from "@everband/validation";
import { and, asc, count, desc, eq, gte, like, lte, or, type SQL, sql } from "drizzle-orm";
import { recordAudit } from "./audit.ts";

export interface LedgerEntryRow {
  id: string;
  direction: "income" | "expense";
  amountMinor: number;
  occurredOn: string;
  category: string;
  description: string | null;
  status: "posted" | "voided";
  createdAt: number;
  updatedAt: number;
  voidedAt: number | null;
}

export interface ListLedgerEntriesInput {
  page: number;
  pageSize: number;
  sort: string;
  order: SortOrder;
  q?: string;
  direction: LedgerDirectionFilter;
  status: LedgerStatusFilter;
  from?: string;
  to?: string;
}

const SORT_COLUMNS = {
  occurredOn: schema.ledgerEntries.occurredOn,
  amount: schema.ledgerEntries.amountMinor,
  createdAt: schema.ledgerEntries.createdAt,
} as const;

export async function listLedgerEntriesCore(
  db: Database,
  orgId: string,
  input: ListLedgerEntriesInput,
): Promise<ListResult<LedgerEntryRow>> {
  const conditions: SQL[] = [eq(schema.ledgerEntries.organizationId, orgId)];
  if (input.direction !== "all")
    conditions.push(eq(schema.ledgerEntries.direction, input.direction));
  if (input.status !== "all") conditions.push(eq(schema.ledgerEntries.status, input.status));
  if (input.from) conditions.push(gte(schema.ledgerEntries.occurredOn, input.from));
  if (input.to) conditions.push(lte(schema.ledgerEntries.occurredOn, input.to));
  if (input.q) {
    const pattern = `%${input.q.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
    conditions.push(
      or(
        like(schema.ledgerEntries.category, pattern),
        like(schema.ledgerEntries.description, pattern),
      ) as SQL,
    );
  }
  const where = and(...conditions);
  const column = SORT_COLUMNS[input.sort as keyof typeof SORT_COLUMNS] ?? SORT_COLUMNS.occurredOn;
  const direction = input.order === "asc" ? asc : desc;
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: schema.ledgerEntries.id,
        direction: schema.ledgerEntries.direction,
        amountMinor: schema.ledgerEntries.amountMinor,
        occurredOn: schema.ledgerEntries.occurredOn,
        category: schema.ledgerEntries.category,
        description: schema.ledgerEntries.description,
        status: schema.ledgerEntries.status,
        createdAt: schema.ledgerEntries.createdAt,
        updatedAt: schema.ledgerEntries.updatedAt,
        voidedAt: schema.ledgerEntries.voidedAt,
      })
      .from(schema.ledgerEntries)
      .where(where)
      .orderBy(
        direction(column),
        desc(schema.ledgerEntries.createdAt),
        asc(schema.ledgerEntries.id),
      )
      .limit(input.pageSize)
      .offset(toOffset(input.page, input.pageSize)),
    db.select({ value: count() }).from(schema.ledgerEntries).where(where),
  ]);
  return {
    items: rows,
    total: totals[0]?.value ?? 0,
    page: input.page,
    pageSize: input.pageSize,
  };
}

export interface LedgerSummary {
  balanceMinor: number;
  monthIncomeMinor: number;
  monthExpenseMinor: number;
  monthNetMinor: number;
}

export async function getLedgerSummaryCore(
  db: Database,
  orgId: string,
  monthStart: string,
  nextMonthStart: string,
): Promise<LedgerSummary> {
  const rows = await db
    .select({
      balanceMinor: sql<number>`coalesce(sum(case when ${schema.ledgerEntries.direction} = 'income' then ${schema.ledgerEntries.amountMinor} else -${schema.ledgerEntries.amountMinor} end), 0)`,
      monthIncomeMinor: sql<number>`coalesce(sum(case when ${schema.ledgerEntries.direction} = 'income' and ${schema.ledgerEntries.occurredOn} >= ${monthStart} and ${schema.ledgerEntries.occurredOn} < ${nextMonthStart} then ${schema.ledgerEntries.amountMinor} else 0 end), 0)`,
      monthExpenseMinor: sql<number>`coalesce(sum(case when ${schema.ledgerEntries.direction} = 'expense' and ${schema.ledgerEntries.occurredOn} >= ${monthStart} and ${schema.ledgerEntries.occurredOn} < ${nextMonthStart} then ${schema.ledgerEntries.amountMinor} else 0 end), 0)`,
    })
    .from(schema.ledgerEntries)
    .where(
      and(
        eq(schema.ledgerEntries.organizationId, orgId),
        eq(schema.ledgerEntries.status, "posted"),
      ),
    );
  const row = rows[0] ?? { balanceMinor: 0, monthIncomeMinor: 0, monthExpenseMinor: 0 };
  return {
    balanceMinor: Number(row.balanceMinor),
    monthIncomeMinor: Number(row.monthIncomeMinor),
    monthExpenseMinor: Number(row.monthExpenseMinor),
    monthNetMinor: Number(row.monthIncomeMinor) - Number(row.monthExpenseMinor),
  };
}

type LedgerWriteResult = { ok: true; changed?: boolean } | { ok: false; error: string };

export async function createLedgerEntryCore(
  db: Database,
  orgId: string,
  input: Omit<CreateLedgerEntryInput, "orgId">,
  actorMembershipId: string,
  now: number,
): Promise<{ ok: true; entryId: string }> {
  const entryId = generateId(ID_PREFIXES.ledgerEntry, now);
  await db.insert(schema.ledgerEntries).values({
    id: entryId,
    organizationId: orgId,
    direction: input.direction,
    amountMinor: input.amountMinor,
    occurredOn: input.occurredOn,
    category: input.category,
    description: input.description || null,
    status: "posted",
    createdByMembershipId: actorMembershipId,
    updatedByMembershipId: actorMembershipId,
    createdAt: now,
    updatedAt: now,
  });
  await recordAudit(db, {
    organizationId: orgId,
    actorMembershipId,
    action: "ledger_entry.created",
    objectType: "ledger_entry",
    objectId: entryId,
    summary: {
      direction: input.direction,
      amountMinor: input.amountMinor,
      occurredOn: input.occurredOn,
    },
  });
  return { ok: true, entryId };
}

export async function updateLedgerEntryCore(
  db: Database,
  orgId: string,
  entryId: string,
  input: Omit<UpdateLedgerEntryInput, "orgId" | "entryId">,
  actorMembershipId: string,
  now: number,
): Promise<LedgerWriteResult> {
  const current = await db
    .select({ status: schema.ledgerEntries.status })
    .from(schema.ledgerEntries)
    .where(
      and(eq(schema.ledgerEntries.id, entryId), eq(schema.ledgerEntries.organizationId, orgId)),
    )
    .limit(1);
  if (!current[0]) return { ok: false, error: "Ledger entry not found." };
  if (current[0].status === "voided")
    return { ok: false, error: "Voided entries cannot be edited." };
  await db
    .update(schema.ledgerEntries)
    .set({
      direction: input.direction,
      amountMinor: input.amountMinor,
      occurredOn: input.occurredOn,
      category: input.category,
      description: input.description === undefined ? undefined : input.description || null,
      updatedByMembershipId: actorMembershipId,
      updatedAt: now,
    })
    .where(
      and(eq(schema.ledgerEntries.id, entryId), eq(schema.ledgerEntries.organizationId, orgId)),
    );
  await recordAudit(db, {
    organizationId: orgId,
    actorMembershipId,
    action: "ledger_entry.updated",
    objectType: "ledger_entry",
    objectId: entryId,
    summary: input,
  });
  return { ok: true };
}

export async function voidLedgerEntryCore(
  db: Database,
  orgId: string,
  entryId: string,
  actorMembershipId: string,
  now: number,
): Promise<LedgerWriteResult> {
  const rows = await db
    .select({ status: schema.ledgerEntries.status })
    .from(schema.ledgerEntries)
    .where(
      and(eq(schema.ledgerEntries.id, entryId), eq(schema.ledgerEntries.organizationId, orgId)),
    )
    .limit(1);
  const current = rows[0];
  if (!current) return { ok: false, error: "Ledger entry not found." };
  if (current.status === "voided") return { ok: true, changed: false };
  await db
    .update(schema.ledgerEntries)
    .set({
      status: "voided",
      updatedByMembershipId: actorMembershipId,
      updatedAt: now,
      voidedAt: now,
    })
    .where(
      and(eq(schema.ledgerEntries.id, entryId), eq(schema.ledgerEntries.organizationId, orgId)),
    );
  await recordAudit(db, {
    organizationId: orgId,
    actorMembershipId,
    action: "ledger_entry.voided",
    objectType: "ledger_entry",
    objectId: entryId,
  });
  return { ok: true, changed: true };
}
