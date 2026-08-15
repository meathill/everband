import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { organizations } from "./org.ts";

// 通知与邮件发送（PRD §5.5）。
// email_sends.dedupKey：同一命令重试不产生重复发送任务；
// email_send_recipients：发送前的受众快照 + 邮箱去重落点。

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    membershipId: text("membership_id").notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    linkPath: text("link_path"),
    objectType: text("object_type"),
    objectId: text("object_id"),
    readAt: integer("read_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_notifications_membership_read").on(table.membershipId, table.readAt)],
);

export const emailSends = sqliteTable(
  "email_sends",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    kind: text("kind").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    // 抄送（群发时每封邮件同一地址，比如经办 staff 留底）
    cc: text("cc"),
    objectType: text("object_type").notNull(),
    objectId: text("object_id").notNull(),
    requestedByMembershipId: text("requested_by_membership_id").notNull(),
    dedupKey: text("dedup_key").notNull(),
    status: text("status", {
      enum: ["queued", "processing", "succeeded", "partial", "failed"],
    }).notNull(),
    recipientCount: integer("recipient_count").notNull().default(0),
    sentCount: integer("sent_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    suppressedCount: integer("suppressed_count").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    finishedAt: integer("finished_at"),
  },
  (table) => [
    uniqueIndex("uq_email_sends_dedup").on(table.dedupKey),
    index("idx_email_sends_org_created").on(table.organizationId, table.createdAt),
  ],
);

export const emailSendRecipients = sqliteTable(
  "email_send_recipients",
  {
    id: text("id").primaryKey(),
    sendId: text("send_id")
      .notNull()
      .references(() => emailSends.id),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    email: text("email").notNull(),
    contactId: text("contact_id"),
    status: text("status", {
      enum: ["queued", "sent", "failed", "suppressed"],
    }).notNull(),
    error: text("error"),
    attemptCount: integer("attempt_count").notNull().default(0),
    sentAt: integer("sent_at"),
  },
  (table) => [
    uniqueIndex("uq_email_recipients_send_email").on(table.sendId, table.email),
    index("idx_email_recipients_send_status").on(table.sendId, table.status),
  ],
);

// 群发写信草稿：每个 membership 每组织一条（写信页自动保存，防丢失）。
// 收件人与受众选择序列化为 JSON，恢复草稿时原样加载。
export const emailDrafts = sqliteTable(
  "email_drafts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    membershipId: text("membership_id").notNull(),
    subject: text("subject").notNull(),
    cc: text("cc"),
    html: text("html").notNull(),
    text: text("text").notNull(),
    recipientsJson: text("recipients_json").notNull(),
    selectionJson: text("selection_json").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_email_drafts_org_member").on(table.organizationId, table.membershipId),
    index("idx_email_drafts_org_updated").on(table.organizationId, table.updatedAt),
  ],
);
