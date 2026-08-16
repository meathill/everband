import type { StaffOverviewData } from "@everband/core";
import { hasStaffAccess } from "@everband/domain";
import { Card, CardPanel } from "@everband/ui/components/card";
import { overviewSearchSchema } from "@everband/validation";
import { createFileRoute, getRouteApi, redirect } from "@tanstack/react-router";
import type React from "react";
import { useState } from "react";
import { PageSkeleton } from "~/components/page-loaders.tsx";
import { getRouteAuthErrorCode } from "~/lib/route-auth-error.ts";
import { getOverview } from "~/server/overview.ts";
import {
  type MonthNavAction,
  OverviewMonthCalendar,
} from "./-components/overview-month-calendar.tsx";

const orgRoute = getRouteApi("/o/$orgId");

export const Route = createFileRoute("/o/$orgId/")({
  validateSearch: overviewSearchSchema,
  loader: async ({ params }) => {
    try {
      return await getOverview({ data: { orgId: params.orgId } });
    } catch (cause) {
      const authError = getRouteAuthErrorCode(cause);
      if (authError === "unauthenticated") throw redirect({ to: "/login" });
      if (authError === "forbidden") throw redirect({ to: "/select-org" });
      throw cause;
    }
  },
  component: OrgOverview,
  pendingComponent: PageSkeleton,
});

function OrgOverview() {
  const { org, role, staffAccess } = orgRoute.useLoaderData();
  const { month: initialMonth, overview, terms, groups } = Route.useLoaderData();
  const isStaff = hasStaffAccess(role, staffAccess);
  const staffOverview = isStaff ? (overview as StaffOverviewData) : null;

  // 月份与日历数据是本地状态：切换月份只局部刷新日历，不走 loader/整页骨架。
  // 初始月 = loader 拿到的当前月；URL 不同步（月份是临时浏览状态）。
  const [month, setMonth] = useState(initialMonth);
  const [calendar, setCalendar] = useState(overview.calendarItems);
  const [monthTerms, setMonthTerms] = useState(terms);
  const [monthGroups, setMonthGroups] = useState(groups);
  const [isMonthLoading, setIsMonthLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState<MonthNavAction | null>(null);

  async function handleMonthChange(nextMonth: string, action: MonthNavAction) {
    if (isMonthLoading) {
      return;
    }
    setMonth(nextMonth);
    setLoadingAction(action);
    setIsMonthLoading(true);
    try {
      const data = await getOverview({ data: { orgId: org.id, month: nextMonth } });
      setCalendar(data.overview.calendarItems);
      setMonthTerms(data.terms);
      setMonthGroups(data.groups);
    } finally {
      setIsMonthLoading(false);
      setLoadingAction(null);
    }
  }

  // 抽屉创建/编辑成功后，本地 state 的日历需要手动刷新（不走 loader）
  async function refreshCalendar() {
    const data = await getOverview({ data: { orgId: org.id, month } });
    setCalendar(data.overview.calendarItems);
    setMonthTerms(data.terms);
    setMonthGroups(data.groups);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-semibold text-3xl text-foreground tracking-tight">Overview</h1>
        <p className="mt-1 text-muted-foreground">{org.name}'s month at a glance.</p>
      </div>
      {staffOverview && <OverviewStatsCards data={staffOverview} />}
      <OverviewMonthCalendar
        groups={monthGroups}
        isStaff={isStaff}
        isLoading={isMonthLoading}
        items={calendar}
        loadingAction={loadingAction}
        month={month}
        onCalendarDataChange={refreshCalendar}
        onMonthChange={handleMonthChange}
        orgId={org.id}
        terms={monthTerms}
        timezone={org.timezone}
      />
    </div>
  );
}

function OverviewStatsCards({ data }: { data: StaffOverviewData }) {
  const stats = data.stats;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <StatCard
        detail={`${stats.activeStudentCount} active`}
        label="Total students"
        value={String(stats.studentCount)}
      />
      <StatCard detail="All statuses" label="Events this month" value={String(stats.eventCount)} />
    </div>
  );
}

function StatCard({
  detail,
  label,
  link,
  value,
}: {
  detail: string;
  label: string;
  link?: React.ReactElement;
  value: string;
}) {
  return (
    <Card render={link} className={link ? "transition-colors hover:bg-accent/40" : undefined}>
      <CardPanel className="p-4">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="mt-2 font-semibold text-2xl tabular-nums tracking-tight">{value}</p>
        <p className="mt-1 text-muted-foreground text-xs">{detail}</p>
      </CardPanel>
    </Card>
  );
}
