import { z } from "zod";
import { createListQuerySchema } from "./list.ts";

export const LEDGER_DIRECTIONS = ["income", "expense"] as const;
export const LEDGER_DIRECTION_FILTERS = ["all", ...LEDGER_DIRECTIONS] as const;
export const LEDGER_STATUS_FILTERS = ["posted", "voided", "all"] as const;
export const CURRENCY_CODES = ["AUD", "NZD", "USD", "GBP", "EUR", "SGD", "CNY"] as const;

const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const amountMinorSchema = z.number().int().positive().max(1_000_000_000);

export const ledgerEntriesListSchema = createListQuerySchema({
  sortFields: ["occurredOn", "amount", "createdAt"],
  defaultSort: "occurredOn",
  defaultOrder: "desc",
  defaultPageSize: 20,
}).extend({
  direction: z.enum(LEDGER_DIRECTION_FILTERS).default("all").catch("all"),
  status: z.enum(LEDGER_STATUS_FILTERS).default("posted").catch("posted"),
  from: localDateSchema.optional().catch(undefined),
  to: localDateSchema.optional().catch(undefined),
});

export const ledgerEntriesPageSchema = ledgerEntriesListSchema.extend({
  orgId: z.string().min(1),
});

const ledgerEntryFields = z.object({
  direction: z.enum(LEDGER_DIRECTIONS),
  amountMinor: amountMinorSchema,
  occurredOn: localDateSchema,
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional(),
});

export const createLedgerEntrySchema = ledgerEntryFields.extend({ orgId: z.string().min(1) });

export const updateLedgerEntrySchema = ledgerEntryFields
  .partial()
  .extend({ orgId: z.string().min(1), entryId: z.string().min(1) })
  .refine(
    (value) =>
      value.direction !== undefined ||
      value.amountMinor !== undefined ||
      value.occurredOn !== undefined ||
      value.category !== undefined ||
      value.description !== undefined,
    { message: "Provide at least one field to update" },
  );

export const voidLedgerEntrySchema = z.object({
  orgId: z.string().min(1),
  entryId: z.string().min(1),
});

export type LedgerDirection = (typeof LEDGER_DIRECTIONS)[number];
export type LedgerDirectionFilter = (typeof LEDGER_DIRECTION_FILTERS)[number];
export type LedgerStatusFilter = (typeof LEDGER_STATUS_FILTERS)[number];
export type LedgerEntriesListQuery = z.output<typeof ledgerEntriesListSchema>;
export type CreateLedgerEntryInput = z.infer<typeof createLedgerEntrySchema>;
export type UpdateLedgerEntryInput = z.infer<typeof updateLedgerEntrySchema>;
