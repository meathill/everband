import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { users } from "./auth.ts";
import { organizations } from "./org.ts";

// 成员域（PRD §5.1）：Household / Contact / Student / Group / Term。
// 邮箱归并的落点：contacts 上 UNIQUE(organizationId, email)。

export const households = sqliteTable(
  "households",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_households_org").on(table.organizationId)],
);

export const contacts = sqliteTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id),
    name: text("name").notNull(),
    // 规范化小写邮箱；组织内唯一（归并依据，PRD：邮箱优先于姓名）
    email: text("email").notNull(),
    phone: text("phone"),
    // parent 接受邀请后关联登录身份
    userId: text("user_id").references(() => users.id),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_contacts_org_email").on(table.organizationId, table.email),
    index("idx_contacts_org_household").on(table.organizationId, table.householdId),
    index("idx_contacts_user").on(table.userId),
  ],
);

export const groups = sqliteTable(
  "groups",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [uniqueIndex("uq_groups_org_name").on(table.organizationId, table.name)],
);

export const students = sqliteTable(
  "students",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id),
    name: text("name").notNull(),
    status: text("status", {
      enum: ["interested", "active", "withdrawn", "archived"],
    }).notNull(),
    // active 学生必须有且只有一个 group（domain 校验 + server 落实）
    groupId: text("group_id").references(() => groups.id),
    statusChangedAt: integer("status_changed_at").notNull(),
    statusChangedByMembershipId: text("status_changed_by_membership_id"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_students_org_status").on(table.organizationId, table.status),
    index("idx_students_org_group").on(table.organizationId, table.groupId),
    index("idx_students_org_household").on(table.organizationId, table.householdId),
  ],
);

export const studentContacts = sqliteTable(
  "student_contacts",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id),
    relationship: text("relationship", {
      enum: ["parent", "guardian", "emergency"],
    }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.studentId, table.contactId] }),
    index("idx_student_contacts_org_contact").on(table.organizationId, table.contactId),
  ],
);

export const terms = sqliteTable(
  "terms",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    // 组织时区下的本地日期字符串（YYYY-MM-DD），排练展开的边界
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [uniqueIndex("uq_terms_org_name").on(table.organizationId, table.name)],
);
