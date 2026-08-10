import type { StaffOverviewData } from "@everband/core";
import { formatOrgDateTime } from "@everband/domain";
import { createFileRoute, getRouteApi, Link, redirect } from "@tanstack/react-router";
import { getOrgContext } from "~/server/org.ts";
import { getStaffOverview } from "~/server/overview.ts";

const orgRoute = getRouteApi("/o/$orgId");

export const Route = createFileRoute("/o/$orgId/")({
  loader: async ({ params }) => {
    const orgId = params.orgId;
    try {
      const ctx = await getOrgContext({ data: { orgId } });
      const isStaff = ctx.role === "owner" || ctx.role === "staff";
      const overview = isStaff ? await getStaffOverview({ data: { orgId } }) : null;
      return { overview };
    } catch {
      throw redirect({ to: "/login" });
    }
  },
  component: OrgOverview,
});

function OrgOverview() {
  const { org, role } = orgRoute.useLoaderData();
  const { overview } = Route.useLoaderData();

  // parent Home 的完整内容后续落地，先保留占位
  if (!overview) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{org.name}</h1>
        <p className="text-muted-foreground">
          {role === "parent"
            ? "Your upcoming events and rehearsals will appear here."
            : "Members, events and rehearsals will appear here as you set them up."}
        </p>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:max-w-md">
          <div>
            <dt className="text-muted-foreground">Type</dt>
            <dd className="font-medium text-foreground capitalize">{org.type}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Timezone</dt>
            <dd className="font-medium text-foreground">{org.timezone}</dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">{org.name}</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <UpcomingEventsCard
          orgId={org.id}
          timezone={org.timezone}
          events={overview.upcomingEvents}
        />
        <PendingSwapsCard
          orgId={org.id}
          swaps={overview.pendingSwaps}
          count={overview.pendingSwapCount}
        />
        <ImportJobsCard orgId={org.id} timezone={org.timezone} jobs={overview.recentImportJobs} />
        <EmailSendsCard orgId={org.id} sends={overview.recentEmailSends} />
      </div>
    </div>
  );
}

function Card({
  title,
  linkTo,
  orgId,
  children,
}: {
  title: string;
  linkTo: string;
  orgId: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <Link
          to={linkTo}
          params={{ orgId }}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          View all
        </Link>
      </div>
      {children}
    </section>
  );
}

function UpcomingEventsCard({
  orgId,
  timezone,
  events,
}: {
  orgId: string;
  timezone: string;
  events: StaffOverviewData["upcomingEvents"];
}) {
  return (
    <Card title="Upcoming events" linkTo="/o/$orgId/events" orgId={orgId}>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No published events coming up.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((event) => (
            <li key={event.id} className="flex items-center justify-between gap-3 text-sm">
              <Link
                to="/o/$orgId/events/$eventId"
                params={{ orgId, eventId: event.id }}
                className="font-medium text-foreground hover:text-primary"
              >
                {event.title}
              </Link>
              <span className="shrink-0 text-muted-foreground num">
                {formatOrgDateTime(event.startsAtUtc, timezone)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PendingSwapsCard({
  orgId,
  swaps,
  count,
}: {
  orgId: string;
  swaps: StaffOverviewData["pendingSwaps"];
  count: number;
}) {
  return (
    <Card title="Pending swaps" linkTo="/o/$orgId/rehearsals" orgId={orgId}>
      {count === 0 ? (
        <p className="text-sm text-muted-foreground">No swap requests waiting.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground num">{count}</span> waiting for approval.
          </p>
          <ul className="flex flex-col gap-2">
            {swaps.map((swap) => (
              <li key={swap.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-foreground">{swap.householdName}</span>
                <span className="shrink-0 text-muted-foreground num">{swap.occurrenceDate}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function ImportJobsCard({
  orgId,
  timezone,
  jobs,
}: {
  orgId: string;
  timezone: string;
  jobs: StaffOverviewData["recentImportJobs"];
}) {
  return (
    <Card title="Import jobs" linkTo="/o/$orgId/import" orgId={orgId}>
      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No imports yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {jobs.map((job) => (
            <li key={job.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground num">
                {formatOrgDateTime(job.createdAt, timezone)}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <StatusText status={job.status} />
                <span className="text-muted-foreground num">
                  {job.createdCount + job.updatedCount}/{job.totalRows} rows
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function EmailSendsCard({
  orgId,
  sends,
}: {
  orgId: string;
  sends: StaffOverviewData["recentEmailSends"];
}) {
  return (
    <Card title="Email sends" linkTo="/o/$orgId/notifications" orgId={orgId}>
      {sends.length === 0 ? (
        <p className="text-sm text-muted-foreground">No emails sent yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sends.map((send) => (
            <li key={send.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-medium text-foreground">{send.subject}</span>
              <span className="flex shrink-0 items-center gap-2">
                <StatusText status={send.status} />
                <span className="text-muted-foreground num">
                  {send.sentCount}/{send.recipientCount} sent
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// queued/processing 一律灰显，不与"已送达"混淆（PRD §10.2）
function StatusText({ status }: { status: string }) {
  return (
    <span
      className={
        status === "succeeded"
          ? "text-success-foreground"
          : status === "failed" || status === "partial"
            ? "text-destructive-foreground"
            : "text-muted-foreground"
      }
    >
      {status}
    </span>
  );
}
