import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { groups } from "./members.ts";
import { organizations } from "./org.ts";

// 活动域（PRD §5.2）：Event / EventUpdate / Attachment。
// EventForm 在 M6 加入。

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    title: text("title").notNull(),
    type: text("type").notNull().default("event"),
    description: text("description"),
    startsAtUtc: integer("starts_at_utc").notNull(),
    endsAtUtc: integer("ends_at_utc"),
    location: text("location"),
    // 组织范围活动对全组织 parent 可见；否则按 event_groups 受众
    isOrgWide: integer("is_org_wide", { mode: "boolean" }).notNull().default(false),
    status: text("status", {
      enum: ["draft", "published", "cancelled", "completed"],
    }).notNull(),
    publishedAt: integer("published_at"),
    createdByMembershipId: text("created_by_membership_id").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_events_org_status_start").on(table.organizationId, table.status, table.startsAtUtc),
  ],
);

export const eventGroups = sqliteTable(
  "event_groups",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.groupId] }),
    index("idx_event_groups_org_group").on(table.organizationId, table.groupId),
  ],
);

export const eventUpdates = sqliteTable(
  "event_updates",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: text("status", { enum: ["draft", "published"] }).notNull(),
    publishedAt: integer("published_at"),
    // 发布后再编辑只更新此时间，不自动重发邮件（PRD §5.2）
    lastEditedAt: integer("last_edited_at"),
    createdByMembershipId: text("created_by_membership_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_event_updates_org_event").on(table.organizationId, table.eventId)],
);

export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    ownerType: text("owner_type", {
      enum: ["event", "event_update", "org_logo", "import_source"],
    }).notNull(),
    ownerId: text("owner_id").notNull(),
    // org/{orgId}/{ownerType}/{ownerId}/{attachmentId}（PRD §8.2）
    r2Key: text("r2_key").notNull().unique(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedByMembershipId: text("uploaded_by_membership_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_attachments_org_owner").on(table.organizationId, table.ownerType, table.ownerId),
  ],
);
