import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organizations } from "./org.ts";

// 轻量公费账本：只记录已发生的收入/支出，不承担 invoice、应收或支付状态机。
export const ledgerEntries = sqliteTable(
  "ledger_entries",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    direction: text("direction", { enum: ["income", "expense"] }).notNull(),
    // 永远为正整数，方向由 direction 表达，避免正负号双重语义
    amountMinor: integer("amount_minor").notNull(),
    // 组织本地日期 YYYY-MM-DD；报表月份按业务发生日而不是写入时间
    occurredOn: text("occurred_on").notNull(),
    category: text("category").notNull(),
    description: text("description"),
    status: text("status", { enum: ["posted", "voided"] })
      .notNull()
      .default("posted"),
    createdByMembershipId: text("created_by_membership_id").notNull(),
    updatedByMembershipId: text("updated_by_membership_id").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    voidedAt: integer("voided_at"),
  },
  (table) => [
    index("idx_ledger_entries_org_date").on(table.organizationId, table.occurredOn),
    index("idx_ledger_entries_org_status").on(table.organizationId, table.status),
  ],
);
