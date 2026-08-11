import { formatOrgTime } from "@everband/domain";
import { Badge } from "@everband/ui/components/badge";
import { Button } from "@everband/ui/components/button";
import { Input } from "@everband/ui/components/input";
import { toastManager } from "@everband/ui/components/toast";
import { ProhibitIcon } from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "~/components/confirm-dialog.tsx";
import {
  cancelRehearsalOccurrence,
  cancelSwapRequest,
  type getRehearsalOverview,
  requestSwap,
} from "~/server/rehearsals.ts";

type Overview = Awaited<ReturnType<typeof getRehearsalOverview>>;
type Occurrence = Overview["occurrences"][number];
type Assignment = Overview["assignments"][number];

export interface OccurrenceListProps {
  orgId: string;
  isStaff: boolean;
  timezone: string;
  occurrences: Overview["occurrences"];
  assignments: Overview["assignments"];
  myHouseholds: Overview["myHouseholds"];
  mySwaps: Overview["mySwaps"];
  focusedOccurrenceId?: string;
}

/** 未来 30 场排练与它们的 helper roster；staff 可取消单场，parent 可申请/撤回换班。 */
export function OccurrenceList({
  orgId,
  isStaff,
  timezone,
  occurrences,
  assignments,
  myHouseholds,
  mySwaps,
  focusedOccurrenceId,
}: OccurrenceListProps): React.ReactElement {
  if (occurrences.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold text-foreground text-xl">Upcoming</h2>
        <p className="text-muted-foreground">No upcoming rehearsals.</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold text-foreground text-xl">Upcoming</h2>
      <ul className="flex max-w-3xl flex-col gap-2">
        {occurrences.map((occurrence) => (
          <OccurrenceCard
            isStaff={isStaff}
            isFocused={focusedOccurrenceId === occurrence.id}
            key={occurrence.id}
            myHouseholds={myHouseholds}
            mySwaps={mySwaps}
            occurrence={occurrence}
            orgId={orgId}
            roster={assignments.filter((row) => row.occurrenceId === occurrence.id)}
            timezone={timezone}
          />
        ))}
      </ul>
    </section>
  );
}

function OccurrenceCard({
  orgId,
  isStaff,
  timezone,
  occurrence,
  roster,
  myHouseholds,
  mySwaps,
  isFocused,
}: {
  orgId: string;
  isStaff: boolean;
  timezone: string;
  occurrence: Occurrence;
  roster: Assignment[];
  myHouseholds: Overview["myHouseholds"];
  mySwaps: Overview["mySwaps"];
  isFocused: boolean;
}): React.ReactElement {
  const router = useRouter();
  const cardRef = useRef<HTMLLIElement>(null);
  const [swapFor, setSwapFor] = useState<string | null>(null);
  const isCancelled = occurrence.status === "cancelled";
  // 已经开始的场次取消没有意义，按钮只在未来场次出现
  const canCancel = isStaff && !isCancelled && occurrence.startsAtUtc > Date.now();

  useEffect(() => {
    if (isFocused) cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [isFocused]);

  async function handleCancelOccurrence(): Promise<boolean> {
    const result = await cancelRehearsalOccurrence({
      data: { orgId, occurrenceId: occurrence.id },
    });
    if (!result.ok) {
      toastManager.add({ title: result.error, type: "error" });
      return false;
    }
    await router.invalidate();
    toastManager.add({ title: "Rehearsal cancelled", type: "success" });
    return true;
  }

  async function handleRequestSwap(assignmentId: string, note: string) {
    const result = await requestSwap({ data: { orgId, assignmentId, note: note || undefined } });
    if (!result.ok) {
      toastManager.add({ title: result.error, type: "error" });
      return;
    }
    setSwapFor(null);
    await router.invalidate();
    toastManager.add({ title: "Swap requested. Staff will review it.", type: "success" });
  }

  async function handleCancelSwap(swapId: string) {
    const result = await cancelSwapRequest({ data: { orgId, swapId } });
    if (!result.ok) {
      toastManager.add({ title: result.error, type: "error" });
      return;
    }
    await router.invalidate();
    toastManager.add({ title: "Swap request withdrawn", type: "success" });
  }

  return (
    <li
      className={`flex flex-col gap-1.5 rounded-lg border bg-card px-4 py-3 text-sm shadow-sm ${isFocused ? "border-primary ring-2 ring-ring/30" : "border-border"}`}
      ref={cardRef}
      tabIndex={isFocused ? -1 : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-foreground tabular-nums">
          {occurrence.localDate} · {formatOrgTime(occurrence.startsAtUtc, timezone)}
          {occurrence.location ? ` · ${occurrence.location}` : ""}
        </p>
        {isCancelled && <Badge variant="error">Cancelled</Badge>}
        {canCancel && (
          <ConfirmDialog
            confirmLabel="Cancel rehearsal"
            description="Families keep seeing this rehearsal, marked as cancelled. Helper duty for the other weeks is unchanged."
            destructive
            onConfirm={handleCancelOccurrence}
            title={`Cancel the rehearsal on ${occurrence.localDate}?`}
            trigger={
              <Button
                aria-label={`Cancel rehearsal on ${occurrence.localDate}`}
                size="xs"
                variant="ghost"
              >
                <ProhibitIcon />
                Cancel
              </Button>
            }
          />
        )}
      </div>

      <ul className="flex flex-wrap items-center gap-2">
        {roster.map((assignment) => (
          <RosterChip
            assignment={assignment}
            isMine={myHouseholds.includes(assignment.householdId)}
            key={assignment.id}
            onCancelSwap={handleCancelSwap}
            onRequestSwap={() => setSwapFor(assignment.id)}
            pendingSwapId={
              mySwaps.find(
                (swap) => swap.assignmentId === assignment.id && swap.status === "requested",
              )?.id
            }
          />
        ))}
        {roster.length === 0 && <li className="text-muted-foreground">No helpers assigned</li>}
      </ul>

      {swapFor && roster.some((row) => row.id === swapFor) && (
        <SwapRequestForm
          onCancel={() => setSwapFor(null)}
          onSubmit={(note) => handleRequestSwap(swapFor, note)}
        />
      )}
    </li>
  );
}

function RosterChip({
  assignment,
  isMine,
  pendingSwapId,
  onRequestSwap,
  onCancelSwap,
}: {
  assignment: Assignment;
  isMine: boolean;
  pendingSwapId: string | undefined;
  onRequestSwap: () => void;
  onCancelSwap: (swapId: string) => void;
}): React.ReactElement {
  return (
    <li
      className={`flex items-center gap-2 rounded-full px-3 py-1 ${
        isMine ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"
      }`}
    >
      {assignment.householdName}
      {assignment.source !== "auto" && (
        <span className="text-xs uppercase">({assignment.source})</span>
      )}
      {isMine && !pendingSwapId && (
        <Button onClick={onRequestSwap} size="xs" variant="ghost">
          Request swap
        </Button>
      )}
      {pendingSwapId && (
        <>
          <span className="text-xs">swap pending</span>
          {isMine && (
            <Button onClick={() => onCancelSwap(pendingSwapId)} size="xs" variant="ghost">
              Cancel request
            </Button>
          )}
        </>
      )}
    </li>
  );
}

/** 换班理由：非受控输入 + 提交时读 FormData。 */
function SwapRequestForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (note: string) => void;
  onCancel: () => void;
}): React.ReactElement {
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const note = String(new FormData(event.currentTarget).get("note") ?? "").trim();
    onSubmit(note);
  }

  return (
    <form className="flex max-w-md items-center gap-2 pt-1" onSubmit={handleSubmit}>
      <Input aria-label="Swap reason" name="note" placeholder="Reason (optional)" />
      <Button size="sm" type="submit">
        Submit
      </Button>
      <Button onClick={onCancel} size="sm" type="button" variant="ghost">
        Cancel
      </Button>
    </form>
  );
}
