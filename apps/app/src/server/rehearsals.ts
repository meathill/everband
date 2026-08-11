import {
  cancelOccurrenceCore,
  cancelSwapRequestCore,
  createNotifications,
  decideSwapCore,
  eligibleHouseholdIds,
  endRehearsalSeriesCore,
  expandSeries,
  householdsOfUser,
  listRehearsalSeriesCore,
  RehearsalError,
  recordAudit,
} from "@everband/core";
import { schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
import {
  cancelOccurrenceSchema,
  cancelSwapRequestSchema,
  createRehearsalSeriesSchema,
  decideSwapSchema,
  endRehearsalSeriesSchema,
  listRehearsalSeriesSchema,
  orgIdSchema,
  requestSwapSchema,
} from "@everband/validation";
import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "./context.ts";
import { requireMembership, STAFF_ROLES } from "./guards.ts";

export const createRehearsalSeries = createServerFn({ method: "POST" })
  .validator(createRehearsalSeriesSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const now = Date.now();
    const seriesId = generateId(ID_PREFIXES.rehearsalSeries);
    await db.insert(schema.rehearsalSeries).values({
      id: seriesId,
      organizationId: data.orgId,
      termId: data.termId,
      groupId: data.groupId ?? null,
      weekday: data.weekday,
      startTimeLocal: data.startTimeLocal,
      endTimeLocal: data.endTimeLocal,
      location: data.location ?? null,
      helpersNeeded: data.helpersNeeded,
      createdAt: now,
    });
    let result: { occurrencesCreated: number; assignmentsCreated: number };
    try {
      result = await expandSeries(db, data.orgId, seriesId, now);
    } catch (cause) {
      if (cause instanceof RehearsalError) {
        return { ok: false as const, error: cause.message };
      }
      throw cause;
    }
    await recordAudit(db, {
      organizationId: data.orgId,
      actorMembershipId: ctx.membershipId,
      action: "rehearsal_series.created",
      objectType: "rehearsal_series",
      objectId: seriesId,
      summary: { termId: data.termId, weekday: data.weekday, ...result },
    });
    return { ok: true as const, seriesId, ...result };
  });

// staff：series 列表 + 未来 occurrence（含 roster 与待审换班）
export const getRehearsalOverview = createServerFn({ method: "GET" })
  .validator(orgIdSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId);
    const isStaff = ctx.role === "owner" || ctx.role === "staff";
    const now = Date.now();

    const occurrences = await db
      .select({
        id: schema.rehearsalOccurrences.id,
        localDate: schema.rehearsalOccurrences.localDate,
        startsAtUtc: schema.rehearsalOccurrences.startsAtUtc,
        status: schema.rehearsalOccurrences.status,
        seriesId: schema.rehearsalOccurrences.seriesId,
        location: schema.rehearsalSeries.location,
      })
      .from(schema.rehearsalOccurrences)
      .innerJoin(
        schema.rehearsalSeries,
        eq(schema.rehearsalSeries.id, schema.rehearsalOccurrences.seriesId),
      )
      .where(
        and(
          eq(schema.rehearsalOccurrences.organizationId, data.orgId),
          gte(schema.rehearsalOccurrences.startsAtUtc, now - 24 * 3600 * 1000),
        ),
      )
      .orderBy(asc(schema.rehearsalOccurrences.startsAtUtc))
      .limit(30);

    const occurrenceIds = occurrences.map((o) => o.id);
    const assignments = occurrenceIds.length
      ? await db
          .select({
            id: schema.rosterAssignments.id,
            occurrenceId: schema.rosterAssignments.occurrenceId,
            householdId: schema.rosterAssignments.householdId,
            householdName: schema.households.name,
            source: schema.rosterAssignments.source,
            isLocked: schema.rosterAssignments.isLocked,
          })
          .from(schema.rosterAssignments)
          .innerJoin(
            schema.households,
            eq(schema.households.id, schema.rosterAssignments.householdId),
          )
          .where(inArray(schema.rosterAssignments.occurrenceId, occurrenceIds))
      : [];

    const myHouseholds = isStaff ? [] : await householdsOfUser(db, data.orgId, ctx.user.id);

    const pendingSwaps = isStaff
      ? await db
          .select({
            id: schema.swapRequests.id,
            assignmentId: schema.swapRequests.assignmentId,
            note: schema.swapRequests.note,
            createdAt: schema.swapRequests.createdAt,
          })
          .from(schema.swapRequests)
          .where(
            and(
              eq(schema.swapRequests.organizationId, data.orgId),
              eq(schema.swapRequests.status, "requested"),
            ),
          )
      : [];

    // 我发起的换班（parent 端展示状态）
    const mySwaps = await db
      .select({
        id: schema.swapRequests.id,
        assignmentId: schema.swapRequests.assignmentId,
        status: schema.swapRequests.status,
      })
      .from(schema.swapRequests)
      .where(
        and(
          eq(schema.swapRequests.organizationId, data.orgId),
          eq(schema.swapRequests.requestedByMembershipId, ctx.membershipId),
        ),
      );

    const eligible = isStaff ? await eligibleHouseholdIds(db, data.orgId, null) : [];
    const householdNames = eligible.length
      ? await db
          .select({ id: schema.households.id, name: schema.households.name })
          .from(schema.households)
          .where(inArray(schema.households.id, eligible))
      : [];

    return {
      role: ctx.role,
      occurrences,
      assignments,
      myHouseholds,
      pendingSwaps,
      mySwaps,
      eligibleHouseholds: householdNames,
    };
  });

export const requestSwap = createServerFn({ method: "POST" })
  .validator(requestSwapSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId);
    const now = Date.now();

    // 只能为自己 household 的 assignment 发起换班
    const assignments = await db
      .select({ householdId: schema.rosterAssignments.householdId })
      .from(schema.rosterAssignments)
      .where(
        and(
          eq(schema.rosterAssignments.id, data.assignmentId),
          eq(schema.rosterAssignments.organizationId, data.orgId),
        ),
      )
      .limit(1);
    const assignment = assignments[0];
    if (!assignment) {
      return { ok: false as const, error: "Assignment not found." };
    }
    const myHouseholds = await householdsOfUser(db, data.orgId, ctx.user.id);
    if (!myHouseholds.includes(assignment.householdId)) {
      return { ok: false as const, error: "You can only request a swap for your own duty." };
    }

    const swapId = generateId(ID_PREFIXES.swapRequest);
    await db.insert(schema.swapRequests).values({
      id: swapId,
      organizationId: data.orgId,
      assignmentId: data.assignmentId,
      requestedByMembershipId: ctx.membershipId,
      note: data.note ?? null,
      status: "requested",
      createdAt: now,
    });
    await recordAudit(db, {
      organizationId: data.orgId,
      actorMembershipId: ctx.membershipId,
      action: "swap.requested",
      objectType: "swap_request",
      objectId: swapId,
      summary: { assignmentId: data.assignmentId },
    });
    return { ok: true as const, swapId };
  });

export const decideSwap = createServerFn({ method: "POST" })
  .validator(decideSwapSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const now = Date.now();
    let result: { assignmentId: string; requestedByMembershipId: string };
    try {
      result = await decideSwapCore(
        db,
        data.orgId,
        data.swapId,
        data.decision,
        ctx.membershipId,
        data.replacementHouseholdId,
        now,
      );
    } catch (cause) {
      if (cause instanceof RehearsalError) {
        return { ok: false as const, error: cause.message };
      }
      throw cause;
    }
    // 通知申请人（PRD §6.5 步骤 9）
    await createNotifications(
      db,
      data.orgId,
      [result.requestedByMembershipId],
      {
        type: "swap-result",
        title: `Your swap request was ${data.decision}`,
        linkPath: `/o/${data.orgId}/rehearsals`,
        objectType: "swap_request",
        objectId: data.swapId,
      },
      now,
    );
    await recordAudit(db, {
      organizationId: data.orgId,
      actorMembershipId: ctx.membershipId,
      action: `swap.${data.decision}`,
      objectType: "swap_request",
      objectId: data.swapId,
      summary: { replacementHouseholdId: data.replacementHouseholdId ?? null },
    });
    return { ok: true as const };
  });

// 申请人自己撤回 pending 换班：不是 staff 操作，所以不限角色，归属校验在 core 里
export const cancelSwapRequest = createServerFn({ method: "POST" })
  .validator(cancelSwapRequestSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId);
    return cancelSwapRequestCore(db, data.orgId, data.swapId, ctx.membershipId, Date.now());
  });

// staff：series 一览（含未来场次数与 active/ended 状态）
export const listRehearsalSeries = createServerFn({ method: "GET" })
  .validator(listRehearsalSeriesSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    await requireMembership(db, data.orgId, STAFF_ROLES);
    return listRehearsalSeriesCore(db, data.orgId, { groupId: data.groupId }, Date.now());
  });

export const endRehearsalSeries = createServerFn({ method: "POST" })
  .validator(endRehearsalSeriesSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    return endRehearsalSeriesCore(db, data.orgId, data.seriesId, ctx.membershipId, Date.now());
  });

export const cancelRehearsalOccurrence = createServerFn({ method: "POST" })
  .validator(cancelOccurrenceSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    return cancelOccurrenceCore(db, data.orgId, data.occurrenceId, ctx.membershipId);
  });

export const listSeriesInputs = createServerFn({ method: "GET" })
  .validator(orgIdSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    await requireMembership(db, data.orgId, STAFF_ROLES);
    const [termRows, groupRows] = await Promise.all([
      db.select().from(schema.terms).where(eq(schema.terms.organizationId, data.orgId)),
      db.select().from(schema.groups).where(eq(schema.groups.organizationId, data.orgId)),
    ]);
    return { terms: termRows, groups: groupRows };
  });
