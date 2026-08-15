import type { StaffOverviewData } from "@everband/core";
import { hasStaffAccess } from "@everband/domain";
import { Card, CardPanel } from "@everband/ui/components/card";
import { overviewSearchSchema } from "@everband/validation";
import { createFileRoute, getRouteApi, redirect } from "@tanstack/react-router";
import { PageSkeleton } from "~/components/page-loaders.tsx";
import { getRouteAuthErrorCode } from "~/lib/route-auth-error.ts";
import { getOverview } from "~/server/overview.ts";
import { OverviewMonthCalendar } from "./-components/overview-month-calendar.tsx";

const orgRoute = getRouteApi("/o/$orgId");

export const Route = createFileRoute("/o/$orgId/")({
  validateSearch: overviewSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    try {
      return await getOverview({ data: { orgId: params.orgId, month: deps.month } });
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
  const { month, overview, terms, groups } = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const isStaff = hasStaffAccess(role, staffAccess);
  const staffOverview = isStaff ? (overview as StaffOverviewData) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-semibold text-3xl text-foreground tracking-tight">Overview</h1>
        <p className="mt-1 text-muted-foreground">{org.name}'s month at a glance.</p>
      </div>
      {staffOverview && <OverviewStatsCards data={staffOverview} />}
      <OverviewMonthCalendar
        groups={groups}
        isStaff={isStaff}
        items={overview.calendarItems}
        month={month}
        onMonthChange={(nextMonth) => navigate({ search: { month: nextMonth } })}
        orgId={org.id}
        terms={terms}
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
