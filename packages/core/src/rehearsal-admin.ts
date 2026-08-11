// staff 侧的排练管理核心（series 列表 / 结束 series / 取消单场 / 申请人撤回换班）。
// rehearsals.ts 管展开与轮换，这里管人为干预，两者互不依赖。

import type { Database } from "@everband/db";
import { schema } from "@everband/db";
import { canTransitionSwap } from "@everband/domain";
import { and, asc, count, eq, gte } from "drizzle-orm";
import { recordAudit } from "./audit.ts";

export interface RehearsalSeriesRow {
  id: string;
  groupId: string | null;
  groupName: string | null;
  termId: string;
  termName: string;
  weekday: number;
  startTimeLocal: string;
  endTimeLocal: string;
  location: string | null;
  helpersNeeded: number;
  /** 未来（>= now）仍排着的场次数 */
  upcomingCount: number;
  /**
   * ended = 已被显式结束（isEnabled=false），或 term 已跑完（未来没有 scheduled 场次）。
   * 两条推导都不需要新字段：expandSeries 本来就跳过 isEnabled=false 的 series。
   */
  status: "active" | "ended";
}

export interface ListRehearsalSeriesInput {
  groupId?: string;
}

export async function listRehearsalSeriesCore(
  db: Database,
  orgId: string,
  input: ListRehearsalSeriesInput,
  nowUtcMs: number,
): Promise<RehearsalSeriesRow[]> {
  const conditions = [eq(schema.rehearsalSeries.organizationId, orgId)];
  if (input.groupId) {
    conditions.push(eq(schema.rehearsalSeries.groupId, input.groupId));
  }

  const rows = await db
    .select({
      id: schema.rehearsalSeries.id,
      groupId: schema.rehearsalSeries.groupId,
      groupName: schema.groups.name,
      termId: schema.rehearsalSeries.termId,
      termName: schema.terms.name,
      weekday: schema.rehearsalSeries.weekday,
      startTimeLocal: schema.rehearsalSeries.startTimeLocal,
      endTimeLocal: schema.rehearsalSeries.endTimeLocal,
      location: schema.rehearsalSeries.location,
      helpersNeeded: schema.rehearsalSeries.helpersNeeded,
      isEnabled: schema.rehearsalSeries.isEnabled,
    })
    .from(schema.rehearsalSeries)
    .innerJoin(schema.terms, eq(schema.terms.id, schema.rehearsalSeries.termId))
    // groupId 可为 NULL（全组织），必须 left join
    .leftJoin(schema.groups, eq(schema.groups.id, schema.rehearsalSeries.groupId))
    .where(and(...conditions))
    .orderBy(asc(schema.rehearsalSeries.weekday), asc(schema.rehearsalSeries.startTimeLocal));

  // 未来场次数一次性按 series 聚合，避免每行一条查询
  const upcoming = await db
    .select({ seriesId: schema.rehearsalOccurrences.seriesId, value: count() })
    .from(schema.rehearsalOccurrences)
    .where(
      and(
        eq(schema.rehearsalOccurrences.organizationId, orgId),
        eq(schema.rehearsalOccurrences.status, "scheduled"),
        gte(schema.rehearsalOccurrences.startsAtUtc, nowUtcMs),
      ),
    )
    .groupBy(schema.rehearsalOccurrences.seriesId);
  const countBySeries = new Map(upcoming.map((row) => [row.seriesId, row.value]));

  return rows.map(({ isEnabled, ...row }) => {
    const upcomingCount = countBySeries.get(row.id) ?? 0;
    return {
      ...row,
      upcomingCount,
      status: isEnabled && upcomingCount > 0 ? ("active" as const) : ("ended" as const),
    };
  });
}

export type EndRehearsalSeriesResult =
  | { ok: true; cancelledCount: number }
  | { ok: false; error: string };

/**
 * 结束 series：未来仍排着的场次全部置 cancelled，series 本身 isEnabled=false
 * （expandSeries 从此跳过它，不会再被展开回来）。过去的场次是历史记录，不动。
 *
 * 已结束的 series 再调用直接返回 ok（cancelledCount=0）且不重复记 audit：
 * 这个操作只可能来自陈旧界面的重复点击，报错没有信息量。
 */
export async function endRehearsalSeriesCore(
  db: Database,
  orgId: string,
  seriesId: string,
  actorMembershipId: string,
  nowUtcMs: number,
): Promise<EndRehearsalSeriesResult> {
  const rows = await db
    .select({ isEnabled: schema.rehearsalSeries.isEnabled })
    .from(schema.rehearsalSeries)
    .where(
      and(
        eq(schema.rehearsalSeries.id, seriesId),
        eq(schema.rehearsalSeries.organizationId, orgId),
      ),
    )
    .limit(1);
  const series = rows[0];
  if (!series) {
    return { ok: false, error: "Rehearsal series not found." };
  }
  if (!series.isEnabled) {
    return { ok: true, cancelledCount: 0 };
  }

  const cancelled = await db
    .update(schema.rehearsalOccurrences)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(schema.rehearsalOccurrences.seriesId, seriesId),
        eq(schema.rehearsalOccurrences.organizationId, orgId),
        eq(schema.rehearsalOccurrences.status, "scheduled"),
        gte(schema.rehearsalOccurrences.startsAtUtc, nowUtcMs),
      ),
    )
    .returning({ id: schema.rehearsalOccurrences.id });

  await db
    .update(schema.rehearsalSeries)
    .set({ isEnabled: false })
    .where(
      and(
        eq(schema.rehearsalSeries.id, seriesId),
        eq(schema.rehearsalSeries.organizationId, orgId),
      ),
    );

  await recordAudit(db, {
    organizationId: orgId,
    actorMembershipId,
    action: "rehearsal_series.ended",
    objectType: "rehearsal_series",
    objectId: seriesId,
    summary: { cancelledCount: cancelled.length },
  });
  return { ok: true, cancelledCount: cancelled.length };
}

export type CancelOccurrenceResult = { ok: true; changed: boolean } | { ok: false; error: string };

/**
 * 取消单场排练。已经是 cancelled 时返回 ok 但 changed=false，不重复记 audit——
 * 重复调用只会来自双击或另一个标签页的陈旧数据，用户要的结果已经成立。
 */
export async function cancelOccurrenceCore(
  db: Database,
  orgId: string,
  occurrenceId: string,
  actorMembershipId: string,
): Promise<CancelOccurrenceResult> {
  const rows = await db
    .select({
      status: schema.rehearsalOccurrences.status,
      localDate: schema.rehearsalOccurrences.localDate,
      seriesId: schema.rehearsalOccurrences.seriesId,
    })
    .from(schema.rehearsalOccurrences)
    .where(
      and(
        eq(schema.rehearsalOccurrences.id, occurrenceId),
        eq(schema.rehearsalOccurrences.organizationId, orgId),
      ),
    )
    .limit(1);
  const occurrence = rows[0];
  if (!occurrence) {
    return { ok: false, error: "Rehearsal not found." };
  }
  if (occurrence.status === "cancelled") {
    return { ok: true, changed: false };
  }

  await db
    .update(schema.rehearsalOccurrences)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(schema.rehearsalOccurrences.id, occurrenceId),
        eq(schema.rehearsalOccurrences.organizationId, orgId),
      ),
    );
  await recordAudit(db, {
    organizationId: orgId,
    actorMembershipId,
    action: "rehearsal_occurrence.cancelled",
    objectType: "rehearsal_occurrence",
    objectId: occurrenceId,
    summary: { localDate: occurrence.localDate, seriesId: occurrence.seriesId },
  });
  return { ok: true, changed: true };
}

export type CancelSwapRequestResult = { ok: true } | { ok: false; error: string };

/**
 * 申请人撤回自己的换班申请。终态用 swap_requests 已有的 "cancelled"
 * （domain 的状态机也已允许 requested → cancelled），不需要迁移。
 * decidedBy 记申请人本人：这条流转确实是他做的决定。
 */
export async function cancelSwapRequestCore(
  db: Database,
  orgId: string,
  swapId: string,
  requesterMembershipId: string,
  nowUtcMs: number,
): Promise<CancelSwapRequestResult> {
  const rows = await db
    .select({
      status: schema.swapRequests.status,
      assignmentId: schema.swapRequests.assignmentId,
      requestedByMembershipId: schema.swapRequests.requestedByMembershipId,
    })
    .from(schema.swapRequests)
    .where(and(eq(schema.swapRequests.id, swapId), eq(schema.swapRequests.organizationId, orgId)))
    .limit(1);
  const swap = rows[0];
  if (!swap) {
    return { ok: false, error: "Swap request not found." };
  }
  if (swap.requestedByMembershipId !== requesterMembershipId) {
    return { ok: false, error: "You can only cancel your own swap request." };
  }
  if (!canTransitionSwap(swap.status, "cancelled")) {
    return { ok: false, error: `This request was already ${swap.status}.` };
  }

  await db
    .update(schema.swapRequests)
    .set({
      status: "cancelled",
      decidedByMembershipId: requesterMembershipId,
      decidedAt: nowUtcMs,
    })
    .where(eq(schema.swapRequests.id, swapId));
  await recordAudit(db, {
    organizationId: orgId,
    actorMembershipId: requesterMembershipId,
    action: "swap.cancelled",
    objectType: "swap_request",
    objectId: swapId,
    summary: { assignmentId: swap.assignmentId, selfCancelled: true },
  });
  return { ok: true };
}
