import { formatOrgTime } from "@everband/domain";
import { Button } from "@everband/ui/components/button";
import { Input } from "@everband/ui/components/input";
import { createFileRoute, getRouteApi, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
  createRehearsalSeries,
  decideSwap,
  getRehearsalOverview,
  listSeriesInputs,
  requestSwap,
} from "~/server/rehearsals.ts";

export const Route = createFileRoute("/o/$orgId/rehearsals")({
  loader: async ({ params }) => {
    try {
      const overview = await getRehearsalOverview({ data: { orgId: params.orgId } });
      const isStaff = overview.role === "owner" || overview.role === "staff";
      const inputs = isStaff
        ? await listSeriesInputs({ data: { orgId: params.orgId } })
        : { terms: [], groups: [] };
      return { ...overview, ...inputs, isStaff };
    } catch {
      throw redirect({ to: "/o/$orgId", params: { orgId: params.orgId } });
    }
  },
  component: RehearsalsPage,
});

type Loaded = Awaited<ReturnType<typeof getRehearsalOverview>> &
  Awaited<ReturnType<typeof listSeriesInputs>> & { isStaff: boolean };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const orgRoute = getRouteApi("/o/$orgId");

function RehearsalsPage() {
  const data = Route.useLoaderData() as Loaded;
  const { org } = orgRoute.useLoaderData();
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Rehearsals</h1>
      {data.isStaff && <CreateSeriesForm terms={data.terms} groups={data.groups} />}
      {data.isStaff && data.pendingSwaps.length > 0 && <PendingSwaps data={data} />}
      <OccurrenceList data={data} timezone={org.timezone} />
    </div>
  );
}

function CreateSeriesForm({ terms, groups }: { terms: Loaded["terms"]; groups: Loaded["groups"] }) {
  const { orgId } = Route.useParams();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const selectClass =
    "h-9 rounded-md border border-input bg-popover px-3 text-base text-foreground sm:h-8 sm:text-sm";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const result = await createRehearsalSeries({
        data: {
          orgId,
          termId: String(form.get("termId")),
          groupId: String(form.get("groupId")) || undefined,
          weekday: Number(form.get("weekday")),
          startTimeLocal: String(form.get("startTime")),
          endTimeLocal: String(form.get("endTime")),
          location: String(form.get("location") || "") || undefined,
          helpersNeeded: Number(form.get("helpersNeeded")),
        },
      });
      if (result.ok) {
        setIsOpen(false);
        setMessage(
          `Created ${result.occurrencesCreated} rehearsals with ${result.assignmentsCreated} helper assignments.`,
        );
        await router.invalidate();
      } else {
        setMessage(result.error);
      }
    } finally {
      setIsBusy(false);
    }
  }

  if (terms.length === 0) {
    return (
      <p className="text-muted-foreground">
        Add a school term in Settings before creating weekly rehearsals.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      {!isOpen && (
        <div>
          <Button onClick={() => setIsOpen(true)}>New weekly rehearsal</Button>
        </div>
      )}
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
      {isOpen && (
        <form
          onSubmit={handleSubmit}
          className="grid max-w-3xl grid-cols-1 items-end gap-3 rounded-lg border border-border bg-card p-4 shadow-sm sm:grid-cols-3"
        >
          <label className="flex flex-col gap-1.5" htmlFor="series-term">
            <span className="text-sm font-medium text-foreground">Term</span>
            <select id="series-term" name="termId" className={selectClass} required>
              {terms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5" htmlFor="series-group">
            <span className="text-sm font-medium text-foreground">Group</span>
            <select id="series-group" name="groupId" className={selectClass} defaultValue="">
              <option value="">Whole organization</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5" htmlFor="series-weekday">
            <span className="text-sm font-medium text-foreground">Weekday</span>
            <select id="series-weekday" name="weekday" className={selectClass} defaultValue="3">
              {WEEKDAYS.map((name, index) => (
                <option key={name} value={index}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5" htmlFor="series-start">
            <span className="text-sm font-medium text-foreground">Starts</span>
            <Input id="series-start" name="startTime" type="time" defaultValue="17:30" required />
          </label>
          <label className="flex flex-col gap-1.5" htmlFor="series-end">
            <span className="text-sm font-medium text-foreground">Ends</span>
            <Input id="series-end" name="endTime" type="time" defaultValue="19:00" required />
          </label>
          <label className="flex flex-col gap-1.5" htmlFor="series-helpers">
            <span className="text-sm font-medium text-foreground">Helpers needed</span>
            <Input
              id="series-helpers"
              name="helpersNeeded"
              type="number"
              min={1}
              max={10}
              defaultValue={1}
              required
            />
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2" htmlFor="series-location">
            <span className="text-sm font-medium text-foreground">Location</span>
            <Input id="series-location" name="location" placeholder="School hall" />
          </label>
          <div className="flex gap-2">
            <Button type="submit" loading={isBusy}>
              Create
            </Button>
            <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

function PendingSwaps({ data }: { data: Loaded }) {
  const { orgId } = Route.useParams();
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function handleDecision(
    swapId: string,
    decision: "approved" | "declined",
    replacementHouseholdId?: string,
  ) {
    setMessage(null);
    const result = await decideSwap({ data: { orgId, swapId, decision, replacementHouseholdId } });
    if (!result.ok) {
      setMessage(result.error);
    }
    await router.invalidate();
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold text-foreground">
        Swap requests ({data.pendingSwaps.length})
      </h2>
      {message && <p className="text-sm text-destructive-foreground">{message}</p>}
      <ul className="flex max-w-2xl flex-col gap-2">
        {data.pendingSwaps.map((swap) => {
          const assignment = data.assignments.find((a) => a.id === swap.assignmentId);
          const occurrence = data.occurrences.find((o) => o.id === assignment?.occurrenceId);
          return (
            <li
              key={swap.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-sm shadow-sm"
            >
              <p className="text-foreground">
                <strong>{assignment?.householdName ?? "Unknown household"}</strong> asks to swap out
                of {occurrence?.localDate ?? "a rehearsal"}
                {swap.note ? ` — "${swap.note}"` : ""}
              </p>
              <SwapDecisionRow
                swapId={swap.id}
                currentHouseholdId={assignment?.householdId}
                eligibleHouseholds={data.eligibleHouseholds}
                onDecide={handleDecision}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SwapDecisionRow({
  swapId,
  currentHouseholdId,
  eligibleHouseholds,
  onDecide,
}: {
  swapId: string;
  currentHouseholdId: string | undefined;
  eligibleHouseholds: Loaded["eligibleHouseholds"];
  onDecide: (swapId: string, decision: "approved" | "declined", replacement?: string) => void;
}) {
  const candidates = eligibleHouseholds.filter((h) => h.id !== currentHouseholdId);
  const [replacement, setReplacement] = useState(candidates[0]?.id ?? "");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Replacement household"
        className="h-8 rounded-md border border-input bg-popover px-2 text-sm text-foreground"
        value={replacement}
        onChange={(e) => setReplacement(e.target.value)}
      >
        {candidates.map((household) => (
          <option key={household.id} value={household.id}>
            {household.name}
          </option>
        ))}
      </select>
      <Button size="xs" onClick={() => onDecide(swapId, "approved", replacement)}>
        Approve
      </Button>
      <Button size="xs" variant="destructive-outline" onClick={() => onDecide(swapId, "declined")}>
        Decline
      </Button>
    </div>
  );
}

function OccurrenceList({ data, timezone }: { data: Loaded; timezone: string }) {
  const { orgId } = Route.useParams();
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");

  async function handleRequestSwap(assignmentId: string) {
    setMessage(null);
    const result = await requestSwap({ data: { orgId, assignmentId, note: note || undefined } });
    setMessage(result.ok ? "Swap requested. Staff will review it." : result.error);
    setNoteFor(null);
    setNote("");
    await router.invalidate();
  }

  if (data.occurrences.length === 0) {
    return <p className="text-muted-foreground">No upcoming rehearsals.</p>;
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold text-foreground">Upcoming</h2>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
      <ul className="flex max-w-3xl flex-col gap-2">
        {data.occurrences.map((occurrence) => {
          const roster = data.assignments.filter((a) => a.occurrenceId === occurrence.id);
          return (
            <li
              key={occurrence.id}
              className="flex flex-col gap-1.5 rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-sm"
            >
              <div className="flex items-center justify-between">
                <p className="font-medium text-foreground num">
                  {occurrence.localDate} · {formatOrgTime(occurrence.startsAtUtc, timezone)}
                  {occurrence.location ? ` · ${occurrence.location}` : ""}
                </p>
                {occurrence.status === "cancelled" && (
                  <span className="text-xs font-semibold tracking-wide text-destructive-foreground uppercase">
                    cancelled
                  </span>
                )}
              </div>
              <ul className="flex flex-wrap gap-2">
                {roster.map((assignment) => {
                  const isMine = data.myHouseholds.includes(assignment.householdId);
                  const pendingSwap = data.mySwaps.find(
                    (swap) => swap.assignmentId === assignment.id && swap.status === "requested",
                  );
                  return (
                    <li
                      key={assignment.id}
                      className={`flex items-center gap-2 rounded-full px-3 py-1 ${
                        isMine
                          ? "bg-secondary text-secondary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {assignment.householdName}
                      {assignment.source !== "auto" && (
                        <span className="text-xs uppercase">({assignment.source})</span>
                      )}
                      {isMine && !pendingSwap && (
                        <Button size="xs" variant="ghost" onClick={() => setNoteFor(assignment.id)}>
                          Request swap
                        </Button>
                      )}
                      {pendingSwap && <span className="text-xs">swap pending</span>}
                    </li>
                  );
                })}
                {roster.length === 0 && (
                  <li className="text-muted-foreground">No helpers assigned</li>
                )}
              </ul>
              {noteFor && roster.some((a) => a.id === noteFor) && (
                <div className="flex max-w-md items-center gap-2 pt-1">
                  <Input
                    aria-label="Swap reason"
                    placeholder="Reason (optional)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <Button size="sm" onClick={() => handleRequestSwap(noteFor)}>
                    Submit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setNoteFor(null)}>
                    Cancel
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
