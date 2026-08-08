import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { groups, households, terms } from "./members.ts";
import { organizations } from "./org.ts";

// 排练与 helper roster（PRD §5.4）。

export const rehearsalSeries = sqliteTable(
  "rehearsal_series",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    termId: text("term_id")
      .notNull()
      .references(() => terms.id),
    // NULL = 全组织
    groupId: text("group_id").references(() => groups.id),
    // 0=周日 … 6=周六
    weekday: integer("weekday").notNull(),
    startTimeLocal: text("start_time_local").notNull(),
    endTimeLocal: text("end_time_local").notNull(),
    location: text("location"),
    helpersNeeded: integer("helpers_needed").notNull().default(1),
    isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_series_org_term").on(table.organizationId, table.termId)],
);

export const rehearsalOccurrences = sqliteTable(
  "rehearsal_occurrences",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    seriesId: text("series_id")
      .notNull()
      .references(() => rehearsalSeries.id),
    // 组织时区下的本地日期（展开幂等落点）
    localDate: text("local_date").notNull(),
    startsAtUtc: integer("starts_at_utc").notNull(),
    endsAtUtc: integer("ends_at_utc").notNull(),
    status: text("status", { enum: ["scheduled", "cancelled"] }).notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_occurrences_series_date").on(table.seriesId, table.localDate),
    index("idx_occurrences_org_start").on(table.organizationId, table.startsAtUtc),
  ],
);

export const rosterAssignments = sqliteTable(
  "roster_assignments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    occurrenceId: text("occurrence_id")
      .notNull()
      .references(() => rehearsalOccurrences.id),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id),
    source: text("source", { enum: ["auto", "manual", "swap"] }).notNull(),
    isLocked: integer("is_locked", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_roster_org_occurrence").on(table.organizationId, table.occurrenceId)],
);

export const swapRequests = sqliteTable(
  "swap_requests",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => rosterAssignments.id),
    requestedByMembershipId: text("requested_by_membership_id").notNull(),
    note: text("note"),
    status: text("status", {
      enum: ["requested", "approved", "declined", "cancelled"],
    }).notNull(),
    decidedByMembershipId: text("decided_by_membership_id"),
    decidedAt: integer("decided_at"),
    // 批准后接班的 household
    replacementHouseholdId: text("replacement_household_id"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_swaps_org_status").on(table.organizationId, table.status)],
);
