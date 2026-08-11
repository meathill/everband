import type { RehearsalSeriesRow } from "@everband/core";
import { Badge } from "@everband/ui/components/badge";
import { Button } from "@everband/ui/components/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@everband/ui/components/empty";
import { toastManager } from "@everband/ui/components/toast";
import { PlusIcon, ProhibitIcon } from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";
import type React from "react";
import { useState } from "react";
import { ConfirmDialog } from "~/components/confirm-dialog.tsx";
import { DataTable, type DataTableColumn } from "~/components/data-table/data-table.tsx";
import { endRehearsalSeries } from "~/server/rehearsals.ts";
import { SeriesFormDrawer, type SeriesFormOption, WEEKDAYS } from "./series-form-drawer.tsx";

export interface SeriesSectionProps {
  orgId: string;
  series: RehearsalSeriesRow[];
  terms: SeriesFormOption[];
}

/** staff 的 series 一览：谁、每周什么时候、还剩几场，以及结束整条 series。 */
export function SeriesSection({ orgId, series, terms }: SeriesSectionProps): React.ReactElement {
  const router = useRouter();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const hasTerm = terms.length > 0;

  async function handleEnd(row: RehearsalSeriesRow): Promise<boolean> {
    const result = await endRehearsalSeries({ data: { orgId, seriesId: row.id } });
    if (!result.ok) {
      toastManager.add({ title: result.error, type: "error" });
      return false;
    }
    await router.invalidate();
    toastManager.add({
      title:
        result.cancelledCount > 0
          ? `Series ended, ${result.cancelledCount} upcoming rehearsals cancelled`
          : "Series ended",
      type: "success",
    });
    return true;
  }

  const columns: DataTableColumn<RehearsalSeriesRow>[] = [
    {
      header: "Audience",
      key: "audience",
      render: (row) => (
        <span className="font-medium text-foreground">
          {row.groupId ? "Restricted legacy audience" : "Whole organization"}
        </span>
      ),
    },
    {
      className: "tabular-nums whitespace-nowrap",
      header: "When",
      key: "when",
      render: (row) => `${WEEKDAYS[row.weekday] ?? "—"} ${row.startTimeLocal}–${row.endTimeLocal}`,
    },
    {
      className: "text-muted-foreground",
      header: "Term",
      key: "term",
      render: (row) => row.termName,
    },
    {
      className: "tabular-nums",
      header: "Upcoming",
      key: "upcoming",
      render: (row) => row.upcomingCount,
    },
    {
      header: "Status",
      key: "status",
      render: (row) => (
        <Badge className="capitalize" variant={row.status === "active" ? "success" : "secondary"}>
          {row.status}
        </Badge>
      ),
    },
    {
      className: "text-end",
      header: <span className="sr-only">Actions</span>,
      key: "actions",
      // 已结束的 series 没有后续动作
      render: (row) =>
        row.status === "ended" ? null : (
          <ConfirmDialog
            confirmLabel="End series"
            description={`All ${row.upcomingCount} upcoming rehearsals will be cancelled and no new ones will be generated. Past rehearsals stay in the history.`}
            destructive
            onConfirm={() => handleEnd(row)}
            title="End this weekly rehearsal?"
            trigger={
              <Button aria-label="End series" size="icon" variant="ghost">
                <ProhibitIcon />
              </Button>
            }
          />
        ),
    },
  ];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-foreground text-xl">Weekly rehearsals</h2>
        <Button disabled={!hasTerm} onClick={() => setIsDrawerOpen(true)}>
          <PlusIcon />
          New weekly rehearsal
        </Button>
      </div>
      {!hasTerm && (
        <p className="text-muted-foreground text-sm">
          Add a school term in Settings before creating weekly rehearsals.
        </p>
      )}

      <DataTable
        columns={columns}
        empty={
          <Empty className="py-12 md:py-12">
            <EmptyHeader>
              <EmptyTitle>No weekly rehearsals yet</EmptyTitle>
              <EmptyDescription>
                Create one and every week of the term is scheduled at once.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
        rowKey={(row) => row.id}
        rows={series}
      />

      <SeriesFormDrawer
        onOpenChange={setIsDrawerOpen}
        open={isDrawerOpen}
        orgId={orgId}
        terms={terms}
      />
    </section>
  );
}
