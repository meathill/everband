// 排练展开与 roster 核心（PRD §5.4/§6.5）。
// 展开幂等：UNIQUE(seriesId,localDate)；自动 roster 只补"无任何分配"的 occurrence，
// 手工调整与锁定不会被再次展开覆盖。

import type { Database } from "@everband/db";
import { schema } from "@everband/db";
import {
  canTransitionSwap,
  expandWeeklyDates,
  generateId,
  ID_PREFIXES,
  localDateTimeToUtcMs,
  rotateHouseholds,
} from "@everband/domain";
import { and, asc, eq, inArray } from "drizzle-orm";

export class RehearsalError extends Error {}

// eligible household：目标 group（或全组织）active 学生的 household，按 id 排序（可预测）
export async function eligibleHouseholdIds(
  db: Database,
  orgId: string,
  groupId: string | null,
): Promise<string[]> {
  const conditions = [
    eq(schema.students.organizationId, orgId),
    eq(schema.students.status, "active" as const),
  ];
  if (groupId) {
    conditions.push(eq(schema.students.groupId, groupId));
  }
  const rows = await db
    .selectDistinct({ householdId: schema.students.householdId })
    .from(schema.students)
    .where(and(...conditions));
  return rows.map((row) => row.householdId).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export interface ExpandResult {
  occurrencesCreated: number;
  assignmentsCreated: number;
}

// 展开 series：term 范围内生成 occurrence + 自动轮换 roster。可重复调用（幂等）。
export async function expandSeries(
  db: Database,
  orgId: string,
  seriesId: string,
  now: number,
): Promise<ExpandResult> {
  const seriesRows = await db
    .select({
      id: schema.rehearsalSeries.id,
      termId: schema.rehearsalSeries.termId,
      groupId: schema.rehearsalSeries.groupId,
      weekday: schema.rehearsalSeries.weekday,
      startTimeLocal: schema.rehearsalSeries.startTimeLocal,
      endTimeLocal: schema.rehearsalSeries.endTimeLocal,
      helpersNeeded: schema.rehearsalSeries.helpersNeeded,
      isEnabled: schema.rehearsalSeries.isEnabled,
      timezone: schema.organizations.timezone,
      termStart: schema.terms.startDate,
      termEnd: schema.terms.endDate,
    })
    .from(schema.rehearsalSeries)
    .innerJoin(
      schema.organizations,
      eq(schema.organizations.id, schema.rehearsalSeries.organizationId),
    )
    .innerJoin(schema.terms, eq(schema.terms.id, schema.rehearsalSeries.termId))
    .where(
      and(
        eq(schema.rehearsalSeries.id, seriesId),
        eq(schema.rehearsalSeries.organizationId, orgId),
      ),
    )
    .limit(1);
  const series = seriesRows[0];
  if (!series) {
    throw new RehearsalError("Rehearsal series not found");
  }
  if (!series.isEnabled) {
    return { occurrencesCreated: 0, assignmentsCreated: 0 };
  }

  // 只在 term 范围内生成（PRD §11.3）
  const dates = expandWeeklyDates(series.termStart, series.termEnd, series.weekday);
  let occurrencesCreated = 0;
  for (const localDate of dates) {
    const inserted = await db
      .insert(schema.rehearsalOccurrences)
      .values({
        id: generateId(ID_PREFIXES.rehearsalOccurrence),
        organizationId: orgId,
        seriesId,
        localDate,
        startsAtUtc: localDateTimeToUtcMs(`${localDate}T${series.startTimeLocal}`, series.timezone),
        endsAtUtc: localDateTimeToUtcMs(`${localDate}T${series.endTimeLocal}`, series.timezone),
        status: "scheduled",
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: schema.rehearsalOccurrences.id });
    occurrencesCreated += inserted.length;
  }

  // 自动 roster：只补无任何分配的 occurrence（手工/锁定/换班结果不被覆盖）
  const households = await eligibleHouseholdIds(db, orgId, series.groupId);
  const occurrences = await db
    .select({ id: schema.rehearsalOccurrences.id })
    .from(schema.rehearsalOccurrences)
    .where(
      and(
        eq(schema.rehearsalOccurrences.seriesId, seriesId),
        eq(schema.rehearsalOccurrences.status, "scheduled"),
      ),
    )
    .orderBy(asc(schema.rehearsalOccurrences.localDate));

  let assignmentsCreated = 0;
  for (let index = 0; index < occurrences.length; index++) {
    const occurrence = occurrences[index];
    if (!occurrence) {
      continue;
    }
    const existing = await db
      .select({ id: schema.rosterAssignments.id })
      .from(schema.rosterAssignments)
      .where(eq(schema.rosterAssignments.occurrenceId, occurrence.id))
      .limit(1);
    if (existing.length > 0) {
      continue;
    }
    const rotation = rotateHouseholds(households, index, series.helpersNeeded);
    for (const householdId of rotation) {
      await db.insert(schema.rosterAssignments).values({
        id: generateId(ID_PREFIXES.rosterAssignment),
        organizationId: orgId,
        occurrenceId: occurrence.id,
        householdId,
        source: "auto",
        createdAt: now,
      });
      assignmentsCreated += 1;
    }
  }
  return { occurrencesCreated, assignmentsCreated };
}

// 批准换班：原 assignment 换成 replacement household（source=swap），拒绝保留原分配
export async function decideSwapCore(
  db: Database,
  orgId: string,
  swapId: string,
  decision: "approved" | "declined",
  decidedByMembershipId: string,
  replacementHouseholdId: string | undefined,
  now: number,
): Promise<{ assignmentId: string; requestedByMembershipId: string }> {
  const swaps = await db
    .select()
    .from(schema.swapRequests)
    .where(and(eq(schema.swapRequests.id, swapId), eq(schema.swapRequests.organizationId, orgId)))
    .limit(1);
  const swap = swaps[0];
  if (!swap) {
    throw new RehearsalError("Swap request not found");
  }
  if (!canTransitionSwap(swap.status, decision)) {
    throw new RehearsalError(`This request was already ${swap.status}.`);
  }

  if (decision === "approved") {
    if (!replacementHouseholdId) {
      throw new RehearsalError("Pick a replacement household to approve the swap");
    }
    await db
      .update(schema.rosterAssignments)
      .set({ householdId: replacementHouseholdId, source: "swap" })
      .where(
        and(
          eq(schema.rosterAssignments.id, swap.assignmentId),
          eq(schema.rosterAssignments.organizationId, orgId),
        ),
      );
  }
  await db
    .update(schema.swapRequests)
    .set({
      status: decision,
      decidedByMembershipId,
      decidedAt: now,
      replacementHouseholdId: decision === "approved" ? (replacementHouseholdId ?? null) : null,
    })
    .where(eq(schema.swapRequests.id, swapId));
  return { assignmentId: swap.assignmentId, requestedByMembershipId: swap.requestedByMembershipId };
}

// parent 的 household 集合（联系人已关联该用户）
export async function householdsOfUser(
  db: Database,
  orgId: string,
  userId: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ householdId: schema.contacts.householdId })
    .from(schema.contacts)
    .where(and(eq(schema.contacts.organizationId, orgId), eq(schema.contacts.userId, userId)));
  return rows.map((row) => row.householdId);
}

// 展开幂等回归用：某 series 的分配总量
export async function countAssignments(db: Database, seriesId: string): Promise<number> {
  const rows = await db
    .select({ id: schema.rosterAssignments.id })
    .from(schema.rosterAssignments)
    .innerJoin(
      schema.rehearsalOccurrences,
      eq(schema.rehearsalOccurrences.id, schema.rosterAssignments.occurrenceId),
    )
    .where(inArray(schema.rehearsalOccurrences.seriesId, [seriesId]));
  return rows.length;
}
