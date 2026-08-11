import { Button } from "@everband/ui/components/button";
import { toastManager } from "@everband/ui/components/toast";
import { useRouter } from "@tanstack/react-router";
import type React from "react";
import { useState } from "react";
import { decideSwap, type getRehearsalOverview } from "~/server/rehearsals.ts";

type Overview = Awaited<ReturnType<typeof getRehearsalOverview>>;

export interface SwapSectionProps {
  orgId: string;
  pendingSwaps: Overview["pendingSwaps"];
  assignments: Overview["assignments"];
  occurrences: Overview["occurrences"];
  eligibleHouseholds: Overview["eligibleHouseholds"];
}

/** staff 的换班审批：谁想换、换哪一场，批准时必须指定接班家庭。 */
export function SwapSection({
  orgId,
  pendingSwaps,
  assignments,
  occurrences,
  eligibleHouseholds,
}: SwapSectionProps): React.ReactElement {
  const router = useRouter();

  async function handleDecision(
    swapId: string,
    decision: "approved" | "declined",
    replacementHouseholdId?: string,
  ) {
    const result = await decideSwap({ data: { orgId, swapId, decision, replacementHouseholdId } });
    if (!result.ok) {
      toastManager.add({ title: result.error, type: "error" });
      return;
    }
    await router.invalidate();
    toastManager.add({ title: `Swap ${decision}`, type: "success" });
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold text-foreground text-xl">
        Swap requests ({pendingSwaps.length})
      </h2>
      <ul className="flex max-w-2xl flex-col gap-2">
        {pendingSwaps.map((swap) => {
          const assignment = assignments.find((row) => row.id === swap.assignmentId);
          const occurrence = occurrences.find((row) => row.id === assignment?.occurrenceId);
          return (
            <li
              className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-sm shadow-sm"
              key={swap.id}
            >
              <p className="text-foreground">
                <strong>{assignment?.householdName ?? "Unknown household"}</strong> asks to swap out
                of {occurrence?.localDate ?? "a rehearsal"}
                {swap.note ? ` — "${swap.note}"` : ""}
              </p>
              <SwapDecisionRow
                currentHouseholdId={assignment?.householdId}
                eligibleHouseholds={eligibleHouseholds}
                onDecide={handleDecision}
                swapId={swap.id}
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
  eligibleHouseholds: Overview["eligibleHouseholds"];
  onDecide: (swapId: string, decision: "approved" | "declined", replacement?: string) => void;
}): React.ReactElement {
  const candidates = eligibleHouseholds.filter((household) => household.id !== currentHouseholdId);
  const [replacement, setReplacement] = useState(candidates[0]?.id ?? "");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Replacement household"
        className="h-8 rounded-md border border-input bg-popover px-2 text-foreground text-sm"
        onChange={(event) => setReplacement(event.target.value)}
        value={replacement}
      >
        {candidates.map((household) => (
          <option key={household.id} value={household.id}>
            {household.name}
          </option>
        ))}
      </select>
      <Button onClick={() => onDecide(swapId, "approved", replacement)} size="xs">
        Approve
      </Button>
      <Button onClick={() => onDecide(swapId, "declined")} size="xs" variant="destructive-outline">
        Decline
      </Button>
    </div>
  );
}
