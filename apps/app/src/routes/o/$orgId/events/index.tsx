import { Button } from "@everband/ui/components/button";
import { Input } from "@everband/ui/components/input";
import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { createEvent, listMyUpcomingEvents, listOrgEvents } from "~/server/events.ts";
import { listGroups } from "~/server/members.ts";

export const Route = createFileRoute("/o/$orgId/events/")({
  loader: async ({ params }) => {
    const orgId = params.orgId;
    try {
      // staff：全部活动 + 建活动所需的 groups
      const [events, groups] = await Promise.all([
        listOrgEvents({ data: { orgId } }),
        listGroups({ data: { orgId } }),
      ]);
      return { mode: "staff" as const, events, groups, upcoming: [] };
    } catch {
      // parent：未来 30 天可见活动
      try {
        const upcoming = await listMyUpcomingEvents({ data: { orgId } });
        return { mode: "parent" as const, events: [], groups: [], upcoming };
      } catch {
        throw redirect({ to: "/o/$orgId", params: { orgId } });
      }
    }
  },
  component: EventsPage,
});

function EventsPage() {
  const data = Route.useLoaderData();
  return data.mode === "staff" ? (
    <StaffEvents events={data.events} groups={data.groups} />
  ) : (
    <ParentEvents upcoming={data.upcoming} />
  );
}

function ParentEvents({
  upcoming,
}: {
  upcoming: Awaited<ReturnType<typeof listMyUpcomingEvents>>;
}) {
  const { orgId } = Route.useParams();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Upcoming events</h1>
      {upcoming.length === 0 ? (
        <p className="text-muted-foreground">Nothing scheduled in the next 30 days.</p>
      ) : (
        <ul className="flex max-w-2xl flex-col gap-3">
          {upcoming.map((event) => (
            <li key={event.id}>
              <Link
                to="/o/$orgId/events/$eventId"
                params={{ orgId, eventId: event.id }}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 shadow-sm transition-shadow hover:shadow-md"
              >
                <div>
                  <p className="font-medium text-foreground">
                    {event.title}
                    {event.status === "cancelled" && (
                      <span className="ml-2 text-xs font-semibold tracking-wide text-destructive-foreground uppercase">
                        cancelled
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(event.startsAtUtc).toLocaleString()}
                    {event.location ? ` · ${event.location}` : ""}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StaffEvents({
  events,
  groups,
}: {
  events: Awaited<ReturnType<typeof listOrgEvents>>;
  groups: Awaited<ReturnType<typeof listGroups>>;
}) {
  const { orgId } = Route.useParams();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isOrgWide, setIsOrgWide] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const result = await createEvent({
        data: {
          orgId,
          title: String(form.get("title")),
          type: String(form.get("type") || "event"),
          description: String(form.get("description") || "") || undefined,
          startsAtLocal: String(form.get("startsAt")),
          endsAtLocal: String(form.get("endsAt") || "") || undefined,
          location: String(form.get("location") || "") || undefined,
          isOrgWide,
          groupIds: isOrgWide ? [] : form.getAll("groupIds").map(String),
        },
      });
      if (result.ok) {
        setIsOpen(false);
        await router.invalidate();
      } else {
        setError(result.error);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Events</h1>
        {!isOpen && <Button onClick={() => setIsOpen(true)}>New event</Button>}
      </div>

      {isOpen && (
        <form
          onSubmit={handleSubmit}
          className="flex max-w-2xl flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-foreground">New event (draft)</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5" htmlFor="event-title">
              <span className="text-sm font-medium text-foreground">Title</span>
              <Input id="event-title" name="title" required />
            </label>
            <label className="flex flex-col gap-1.5" htmlFor="event-location">
              <span className="text-sm font-medium text-foreground">Location</span>
              <Input id="event-location" name="location" />
            </label>
            <label className="flex flex-col gap-1.5" htmlFor="event-starts">
              <span className="text-sm font-medium text-foreground">Starts (org time)</span>
              <Input id="event-starts" name="startsAt" type="datetime-local" required />
            </label>
            <label className="flex flex-col gap-1.5" htmlFor="event-ends">
              <span className="text-sm font-medium text-foreground">Ends (optional)</span>
              <Input id="event-ends" name="endsAt" type="datetime-local" />
            </label>
          </div>
          <label className="flex flex-col gap-1.5" htmlFor="event-description">
            <span className="text-sm font-medium text-foreground">Description</span>
            <textarea
              id="event-description"
              name="description"
              rows={3}
              className="rounded-md border border-input bg-popover px-3 py-2 text-base text-foreground sm:text-sm"
            />
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-foreground">Audience</legend>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={isOrgWide}
                onChange={(e) => setIsOrgWide(e.target.checked)}
              />
              Whole organization
            </label>
            {!isOrgWide && (
              <div className="flex flex-wrap gap-3">
                {groups.map((group) => (
                  <label
                    key={group.id}
                    className="flex items-center gap-1.5 text-sm text-foreground"
                  >
                    <input type="checkbox" name="groupIds" value={group.id} />
                    {group.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          {error && <p className="text-sm text-destructive-foreground">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" loading={isBusy}>
              Create draft
            </Button>
            <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {events.length === 0 ? (
        <p className="text-muted-foreground">No events yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full max-w-4xl text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Event</th>
                <th className="py-2 pr-4 font-medium">Starts</th>
                <th className="py-2 pr-4 font-medium">Audience</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-border">
                  <td className="py-2 pr-4">
                    <Link
                      to="/o/$orgId/events/$eventId"
                      params={{ orgId, eventId: event.id }}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {event.title}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-foreground num">
                    {new Date(event.startsAtUtc).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {event.isOrgWide ? "Whole organization" : "Selected groups"}
                  </td>
                  <td className="py-2 text-muted-foreground capitalize">{event.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
