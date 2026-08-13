import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { students } from "./members.ts";
import { organizations } from "./org.ts";
import { qrCodes } from "./qr.ts";

// 器材轻量版（PRD §5.6/§6.8）：维护当前展示信息，不承载借还与维修流水。
export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    type: text("type").notNull(),
    serialNumber: text("serial_number"),
    currentHolderStudentId: text("current_holder_student_id").references(() => students.id),
    // 只供 Staff 查看；公开器材卡永不查询此字段。
    notes: text("notes"),
    // dyqr 不可用时器材仍可先保存，稍后重试生成二维码。
    qrCodeId: text("qr_code_id").references(() => qrCodes.id),
    status: text("status", { enum: ["active", "retired"] })
      .notNull()
      .default("active"),
    createdByMembershipId: text("created_by_membership_id").notNull(),
    updatedByMembershipId: text("updated_by_membership_id").notNull(),
    retiredAt: integer("retired_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_assets_org_status").on(table.organizationId, table.status),
    index("idx_assets_org_holder").on(table.organizationId, table.currentHolderStudentId),
    uniqueIndex("uq_assets_qr_code").on(table.qrCodeId),
  ],
);
