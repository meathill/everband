import type { Database } from "@everband/db";
import { schema } from "@everband/db";
import type { MonthWindow } from "@everband/domain";
import { toLocalDateString } from "@everband/domain";
import { and, asc, count, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { parentGroupIds } from "./events.ts";
import { getLedgerSummaryCore } from "./finance.ts";

export interface OverviewEventItem {
  id: string;
  kind: "event";
  title: string;
  status: "draft" | "published" | "cancelled" | "completed";
  startsAtUtc: number;
  startsAtHasTime: boolean;
  endsAtUtc: number | null;
  endsAtHasTime: boolean;
  localDate: string;
  location: string | null;
}

export interface OverviewRehearsalItem {
  id: string;
  kind: "rehearsal";
  title: "Rehearsal";
  status: "scheduled" | "cancelled";
  startsAtUtc: number;
  endsAtUtc: number;
  localDate: string;
  location: string | null;
}

export type OverviewCalendarItem = OverviewEventItem | OverviewRehearsalItem;

export interface OverviewStats {
  studentCount: number;
  activeStudentCount: number;
  eventCount: number;
  pendingSwapCount: number;
  ledgerBalanceMinor: number;
  ledgerMonthNetMinor: number;
  currencyCode: string;
}

export interface StaffOverviewData {
  stats: OverviewStats;
  calendarItems: OverviewCalendarItem[];
}

export interface ParentOverviewData {
  calendarItems: OverviewCalendarItem[];
}

function eventOverlapCondition(window: MonthWindow) {
  return and(
    lt(schema.events.startsAtUtc, window.endUtcMs),
    or(isNull(schema.events.endsAtUtc), gte(schema.events.endsAtUtc, window.startUtcMs)),
  );
}

function rehearsalOverlapCondition(window: MonthWindow) {
  return and(
    lt(schema.rehearsalOccurrences.startsAtUtc, window.endUtcMs),
    gte(schema.rehearsalOccurrences.endsAtUtc, window.startUtcMs),
  );
}

function sortCalendarItems(items: OverviewCalendarItem[]): OverviewCalendarItem[] {
  return items.sort(
    (left, right) => left.startsAtUtc - right.startsAtUtc || left.kind.localeCompare(right.kind),
  );
}

export async function getStaffOverviewData(
  db: Database,
  orgId: string,
  window: MonthWindow,
  timezone: string,
): Promise<StaffOverviewData> {
  const nextMonthStart = toLocalDateString(window.endUtcMs, timezone);
  const [events, rehearsals, studentCounts, pendingSwapCounts, organizations, ledger] =
    await Promise.all([
      db
        .select({
          id: schema.events.id,
          title: schema.events.title,
          status: schema.events.status,
          startsAtUtc: schema.events.startsAtUtc,
          startsAtHasTime: schema.events.startsAtHasTime,
          endsAtUtc: schema.events.endsAtUtc,
          endsAtHasTime: schema.events.endsAtHasTime,
          location: schema.events.location,
        })
        .from(schema.events)
        .where(and(eq(schema.events.organizationId, orgId), eventOverlapCondition(window)))
        .orderBy(asc(schema.events.startsAtUtc)),
      db
        .select({
          id: schema.rehearsalOccurrences.id,
          status: schema.rehearsalOccurrences.status,
          startsAtUtc: schema.rehearsalOccurrences.startsAtUtc,
          endsAtUtc: schema.rehearsalOccurrences.endsAtUtc,
          localDate: schema.rehearsalOccurrences.localDate,
          location: schema.rehearsalSeries.location,
        })
        .from(schema.rehearsalOccurrences)
        .innerJoin(
          schema.rehearsalSeries,
          eq(schema.rehearsalSeries.id, schema.rehearsalOccurrences.seriesId),
        )
        .where(
          and(
            eq(schema.rehearsalOccurrences.organizationId, orgId),
            rehearsalOverlapCondition(window),
          ),
        )
        .orderBy(asc(schema.rehearsalOccurrences.startsAtUtc)),
      db
        .select({
          studentCount: count(),
          activeStudentCount: sql<number>`sum(case when ${schema.students.status} = 'active' then 1 else 0 end)`,
        })
        .from(schema.students)
        .where(eq(schema.students.organizationId, orgId)),
      db
        .select({ value: count() })
        .from(schema.swapRequests)
        .where(
          and(
            eq(schema.swapRequests.organizationId, orgId),
            eq(schema.swapRequests.status, "requested"),
          ),
        ),
      db
        .select({ currencyCode: schema.organizations.currencyCode })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, orgId))
        .limit(1),
      getLedgerSummaryCore(db, orgId, `${window.month}-01`, nextMonthStart),
    ]);

  const calendarItems: OverviewCalendarItem[] = [
    ...events.map(
      (event): OverviewEventItem => ({
        ...event,
        kind: "event",
        localDate: toLocalDateString(event.startsAtUtc, timezone),
      }),
    ),
    ...rehearsals.map(
      (rehearsal): OverviewRehearsalItem => ({
        ...rehearsal,
        kind: "rehearsal",
        title: "Rehearsal",
      }),
    ),
  ];
  const studentCount = studentCounts[0];
  return {
    stats: {
      studentCount: studentCount?.studentCount ?? 0,
      activeStudentCount: Number(studentCount?.activeStudentCount ?? 0),
      eventCount: events.length,
      pendingSwapCount: pendingSwapCounts[0]?.value ?? 0,
      ledgerBalanceMinor: ledger.balanceMinor,
      ledgerMonthNetMinor: ledger.monthNetMinor,
      currencyCode: organizations[0]?.currencyCode ?? "AUD",
    },
    calendarItems: sortCalendarItems(calendarItems),
  };
}

export async function getParentOverviewData(
  db: Database,
  orgId: string,
  userId: string,
  window: MonthWindow,
  timezone: string,
): Promise<ParentOverviewData> {
  const groupIds = await parentGroupIds(db, orgId, userId);
  const eventAudience =
    groupIds.length > 0
      ? or(
          eq(schema.events.isOrgWide, true),
          inArray(
            schema.events.id,
            db
              .select({ id: schema.eventGroups.eventId })
              .from(schema.eventGroups)
              .where(
                and(
                  eq(schema.eventGroups.organizationId, orgId),
                  inArray(schema.eventGroups.groupId, groupIds),
                ),
              ),
          ),
        )
      : eq(schema.events.isOrgWide, true);
  const rehearsalAudience =
    groupIds.length > 0
      ? or(
          isNull(schema.rehearsalSeries.groupId),
          inArray(schema.rehearsalSeries.groupId, groupIds),
        )
      : isNull(schema.rehearsalSeries.groupId);

  const [events, rehearsals] = await Promise.all([
    db
      .select({
        id: schema.events.id,
        title: schema.events.title,
        status: schema.events.status,
        startsAtUtc: schema.events.startsAtUtc,
        startsAtHasTime: schema.events.startsAtHasTime,
        endsAtUtc: schema.events.endsAtUtc,
        endsAtHasTime: schema.events.endsAtHasTime,
        location: schema.events.location,
      })
      .from(schema.events)
      .where(
        and(
          eq(schema.events.organizationId, orgId),
          inArray(schema.events.status, ["published", "cancelled"]),
          eventOverlapCondition(window),
          eventAudience,
        ),
      )
      .orderBy(asc(schema.events.startsAtUtc)),
    db
      .select({
        id: schema.rehearsalOccurrences.id,
        status: schema.rehearsalOccurrences.status,
        startsAtUtc: schema.rehearsalOccurrences.startsAtUtc,
        endsAtUtc: schema.rehearsalOccurrences.endsAtUtc,
        localDate: schema.rehearsalOccurrences.localDate,
        location: schema.rehearsalSeries.location,
      })
      .from(schema.rehearsalOccurrences)
      .innerJoin(
        schema.rehearsalSeries,
        eq(schema.rehearsalSeries.id, schema.rehearsalOccurrences.seriesId),
      )
      .where(
        and(
          eq(schema.rehearsalOccurrences.organizationId, orgId),
          rehearsalOverlapCondition(window),
          rehearsalAudience,
        ),
      )
      .orderBy(asc(schema.rehearsalOccurrences.startsAtUtc)),
  ]);

  return {
    calendarItems: sortCalendarItems([
      ...events.map(
        (event): OverviewEventItem => ({
          ...event,
          kind: "event",
          localDate: toLocalDateString(event.startsAtUtc, timezone),
        }),
      ),
      ...rehearsals.map(
        (rehearsal): OverviewRehearsalItem => ({
          ...rehearsal,
          kind: "rehearsal",
          title: "Rehearsal",
        }),
      ),
    ]),
  };
}
