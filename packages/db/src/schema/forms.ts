import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { events } from "./events.ts";
import { organizations } from "./org.ts";

// 固定场景表单（PRD §5.3）：每活动最多一个主表单，四种固定场景。

export const eventForms = sqliteTable(
  "event_forms",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    kind: text("kind", { enum: ["rsvp", "volunteer", "choice", "text"] }).notNull(),
    // kind=choice 时为 { options: string[] }；其余为提示文案等轻量配置
    configJson: text("config_json"),
    status: text("status", { enum: ["open", "closed"] }).notNull(),
    closedAt: integer("closed_at"),
    closedByMembershipId: text("closed_by_membership_id"),
    createdByMembershipId: text("created_by_membership_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [uniqueIndex("uq_event_forms_event").on(table.eventId)],
);

export const formSubmissions = sqliteTable(
  "form_submissions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    formId: text("form_id")
      .notNull()
      .references(() => eventForms.id),
    membershipId: text("membership_id").notNull(),
    payloadJson: text("payload_json").notNull(),
    submittedAt: integer("submitted_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    // 一个 parent 对同一表单只有一份有效提交（幂等落点，PRD §5.3）
    uniqueIndex("uq_form_submissions_form_membership").on(table.formId, table.membershipId),
  ],
);
