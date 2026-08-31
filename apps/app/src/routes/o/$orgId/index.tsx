import type { StaffOverviewData } from "@everband/core";
import { hasStaffAccess } from "@everband/domain";
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
import { StaffOverview } from "./-components/staff-overview.tsx";

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
  const loaderData = Route.useLoaderData();
  const isStaff = hasStaffAccess(role, staffAccess);

  if (isStaff) {
    return <StaffOverviewSection org={org} data={loaderData.overview as StaffOverviewData} />;
  }

  return <ParentOverviewSection org={org} loaderData={loaderData} />;
}

function StaffOverviewSection({
  org,
  data,
}: {
  org: { id: string; name: string; timezone: string };
  data: StaffOverviewData;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-semibold text-3xl text-foreground tracking-tight">Overview</h1>
        <p className="mt-1 text-muted-foreground">{org.name} — groups and upcoming work.</p>
      </div>
      <StaffOverview
        groups={data.groups}
        orgId={org.id}
        timezone={org.timezone}
        wipEvents={data.wipEvents}
      />
    </div>
  );
}

function ParentOverviewSection({
  org,
  loaderData,
}: {
  org: { id: string; name: string; timezone: string };
  loaderData: Awaited<ReturnType<typeof getOverview>>;
}): React.ReactElement {
  const { month: initialMonth, overview, terms, groups } = loaderData;

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
      <OverviewMonthCalendar
        groups={monthGroups}
        isStaff={false}
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
