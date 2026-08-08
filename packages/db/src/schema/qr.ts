import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { organizations } from "./org.ts";

// 动态二维码（PRD §5.7）：dyqr 短链归属记录。
// 本版本只创建 org_entry；recruitment/asset 枚举提前定义（§4.3）。

export const qrCodes = sqliteTable(
  "qr_codes",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    targetType: text("target_type", {
      enum: ["org_entry", "recruitment", "asset"],
    }).notNull(),
    targetObjectId: text("target_object_id").notNull(),
    dyqrAlias: text("dyqr_alias").notNull(),
    shortUrl: text("short_url").notNull(),
    currentTargetUrl: text("current_target_url").notNull(),
    status: text("status", { enum: ["active", "disabled", "broken"] }).notNull(),
    scanCount: integer("scan_count"),
    lastStatsSyncAt: integer("last_stats_sync_at"),
    createdByMembershipId: text("created_by_membership_id").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_qr_codes_alias").on(table.dyqrAlias),
    index("idx_qr_codes_org").on(table.organizationId, table.targetType),
  ],
);
