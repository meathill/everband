// staff Overview 聚合（PRD §7.2）：近期活动、待处理换班、导入任务、发送状态。
// 四块并行查询，全部命中现有索引（idx_events_org_status_start / idx_swaps_org_status /
// idx_import_jobs_org_created / idx_email_sends_org_created），无需新迁移。

import type { Database } from "@everband/db";
import { schema } from "@everband/db";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";

const SECTION_LIMIT = 5;

export interface StaffOverviewData {
  upcomingEvents: {
    id: string;
    title: string;
    startsAtUtc: number;
    location: string | null;
  }[];
  pendingSwaps: {
    id: string;
    householdName: string;
    occurrenceDate: string;
    note: string | null;
    createdAt: number;
  }[];
  pendingSwapCount: number;
  recentImportJobs: {
    id: string;
    status: "queued" | "processing" | "succeeded" | "failed";
    totalRows: number;
    createdCount: number;
    updatedCount: number;
    failedCount: number;
    createdAt: number;
    finishedAt: number | null;
  }[];
  recentEmailSends: {
    id: string;
    subject: string;
    status: "queued" | "processing" | "succeeded" | "partial" | "failed";
    recipientCount: number;
    sentCount: number;
    failedCount: number;
    suppressedCount: number;
    createdAt: number;
  }[];
}

export async function getStaffOverviewData(
  db: Database,
  orgId: string,
  now: number,
): Promise<StaffOverviewData> {
  const [upcomingEvents, pendingSwaps, pendingSwapCountRows, recentImportJobs, recentEmailSends] =
    await Promise.all([
      db
        .select({
          id: schema.events.id,
          title: schema.events.title,
          startsAtUtc: schema.events.startsAtUtc,
          location: schema.events.location,
        })
        .from(schema.events)
        .where(
          and(
            eq(schema.events.organizationId, orgId),
            eq(schema.events.status, "published"),
            gte(schema.events.startsAtUtc, now),
          ),
        )
        .orderBy(asc(schema.events.startsAtUtc))
        .limit(SECTION_LIMIT),
      db
        .select({
          id: schema.swapRequests.id,
          householdName: schema.households.name,
          occurrenceDate: schema.rehearsalOccurrences.localDate,
          note: schema.swapRequests.note,
          createdAt: schema.swapRequests.createdAt,
        })
        .from(schema.swapRequests)
        .innerJoin(
          schema.rosterAssignments,
          eq(schema.swapRequests.assignmentId, schema.rosterAssignments.id),
        )
        .innerJoin(
          schema.rehearsalOccurrences,
          eq(schema.rosterAssignments.occurrenceId, schema.rehearsalOccurrences.id),
        )
        .innerJoin(schema.households, eq(schema.rosterAssignments.householdId, schema.households.id))
        .where(
          and(
            eq(schema.swapRequests.organizationId, orgId),
            eq(schema.swapRequests.status, "requested"),
          ),
        )
        .orderBy(asc(schema.swapRequests.createdAt))
        .limit(SECTION_LIMIT),
      db
        .select({ count: sql<number>`count(*)` })
        .from(schema.swapRequests)
        .where(
          and(
            eq(schema.swapRequests.organizationId, orgId),
            eq(schema.swapRequests.status, "requested"),
          ),
        ),
      db
        .select({
          id: schema.importJobs.id,
          status: schema.importJobs.status,
          totalRows: schema.importJobs.totalRows,
          createdCount: schema.importJobs.createdCount,
          updatedCount: schema.importJobs.updatedCount,
          failedCount: schema.importJobs.failedCount,
          createdAt: schema.importJobs.createdAt,
          finishedAt: schema.importJobs.finishedAt,
        })
        .from(schema.importJobs)
        .where(eq(schema.importJobs.organizationId, orgId))
        .orderBy(desc(schema.importJobs.createdAt))
        .limit(SECTION_LIMIT),
      db
        .select({
          id: schema.emailSends.id,
          subject: schema.emailSends.subject,
          status: schema.emailSends.status,
          recipientCount: schema.emailSends.recipientCount,
          sentCount: schema.emailSends.sentCount,
          failedCount: schema.emailSends.failedCount,
          suppressedCount: schema.emailSends.suppressedCount,
          createdAt: schema.emailSends.createdAt,
        })
        .from(schema.emailSends)
        .where(eq(schema.emailSends.organizationId, orgId))
        .orderBy(desc(schema.emailSends.createdAt))
        .limit(SECTION_LIMIT),
    ]);

  return {
    upcomingEvents,
    pendingSwaps,
    pendingSwapCount: pendingSwapCountRows[0]?.count ?? 0,
    recentImportJobs,
    recentEmailSends,
  };
}
