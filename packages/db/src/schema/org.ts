import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./auth.ts";

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("band"),
  // IANA 时区，如 "Australia/Sydney"；所有本地时间计算的唯一依据
  timezone: text("timezone").notNull(),
  // ISO 4217；轻量账本首发默认 AUD，同一组织只使用一种货币
  currencyCode: text("currency_code").notNull().default("AUD"),
  contactEmail: text("contact_email"),
  publicProfileEnabled: integer("public_profile_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  publicSlug: text("public_slug").unique(),
  publicDisplayName: text("public_display_name"),
  publicSummary: text("public_summary"),
  publicLogoAttachmentId: text("public_logo_attachment_id"),
  createdAt: integer("created_at").notNull(),
});

export const memberships = sqliteTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    // 受邀未接受时为空，接受后关联 user
    userId: text("user_id").references(() => users.id),
    role: text("role", { enum: ["owner", "staff", "parent"] }).notNull(),
    status: text("status", {
      enum: ["invited", "active", "suspended", "removed"],
    }).notNull(),
    invitedEmail: text("invited_email").notNull(),
    invitedByMembershipId: text("invited_by_membership_id"),
    acceptedAt: integer("accepted_at"),
    // 非必要运营邮件退订偏好（不影响安全/登录邮件）
    operationalEmailOptOut: integer("operational_email_opt_out", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_memberships_org_user").on(table.organizationId, table.userId),
    index("idx_memberships_user").on(table.userId),
    index("idx_memberships_org_email").on(table.organizationId, table.invitedEmail),
  ],
);

export const auditEntries = sqliteTable(
  "audit_entries",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    // 系统自动操作时为空
    actorMembershipId: text("actor_membership_id"),
    action: text("action").notNull(),
    objectType: text("object_type").notNull(),
    objectId: text("object_id").notNull(),
    // 变更摘要 JSON，不含敏感全文
    summaryJson: text("summary_json"),
    requestId: text("request_id"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_audit_org_created").on(table.organizationId, table.createdAt),
    index("idx_audit_org_object").on(table.organizationId, table.objectType, table.objectId),
  ],
);
