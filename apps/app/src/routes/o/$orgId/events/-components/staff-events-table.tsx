import type { OrgEventRow } from "@everband/core";
import type { EventStatus } from "@everband/domain";
import { formatOrgDateTime } from "@everband/domain";
import { Badge, type BadgeProps } from "@everband/ui/components/badge";
import { Button } from "@everband/ui/components/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@everband/ui/components/empty";
import { toastManager } from "@everband/ui/components/toast";
import type { SortOrder } from "@everband/validation";
import {
  CheckCircleIcon,
  PaperPlaneTiltIcon,
  PencilSimpleIcon,
  ProhibitIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { Link, useRouter } from "@tanstack/react-router";
import type React from "react";
import { ConfirmDialog } from "~/components/confirm-dialog.tsx";
import { DataTable, type DataTableColumn } from "~/components/data-table/data-table.tsx";
import { deleteDraftEvent, transitionEvent } from "~/server/events.ts";

const STATUS_VARIANTS: Record<EventStatus, BadgeProps["variant"]> = {
  cancelled: "error",
  completed: "secondary",
  draft: "outline",
  published: "success",
};

export interface StaffEventsTableProps {
  orgId: string;
  timezone: string;
  rows: OrgEventRow[];
  sort: string;
  order: SortOrder;
  onSortChange: (sort: string, order: SortOrder) => void;
  onEdit: (row: OrgEventRow) => void;
  /** 有筛选条件时空态文案不同：没有结果 ≠ 还没建过活动 */
  isFiltered: boolean;
}

export function StaffEventsTable({
  orgId,
  timezone,
  rows,
  sort,
  order,
  onSortChange,
  onEdit,
  isFiltered,
}: StaffEventsTableProps): React.ReactElement {
  const router = useRouter();

  // 行内操作统一走这条路径：失败弹错误 toast 且不关闭确认框，成功刷新 loader 后再 toast
  async function run(
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    successMessage: string,
  ): Promise<boolean> {
    const result = await action();
    if (!result.ok) {
      toastManager.add({ title: result.error, type: "error" });
      return false;
    }
    await router.invalidate();
    toastManager.add({ title: successMessage, type: "success" });
    return true;
  }

  const columns: DataTableColumn<OrgEventRow>[] = [
    {
      header: "Event",
      key: "title",
      render: (row) => (
        <Link
          className="font-medium text-foreground hover:text-primary"
          params={{ eventId: row.id, orgId }}
          to="/o/$orgId/events/$eventId"
        >
          {row.title}
        </Link>
      ),
      sortable: true,
    },
    {
      className: "tabular-nums whitespace-nowrap",
      defaultOrder: "asc",
      header: "Starts",
      key: "startsAtUtc",
      render: (row) => formatOrgDateTime(row.startsAtUtc, timezone),
      sortable: true,
    },
    {
      className: "text-muted-foreground",
      header: "Audience",
      key: "audience",
      render: (row) => (row.isOrgWide ? "Whole organization" : "Selected groups"),
    },
    {
      header: "Status",
      key: "status",
      render: (row) => (
        <Badge className="capitalize" variant={STATUS_VARIANTS[row.status]}>
          {row.status}
        </Badge>
      ),
    },
    {
      className: "text-end",
      header: <span className="sr-only">Actions</span>,
      key: "actions",
      render: (row) => <RowActions onEdit={onEdit} orgId={orgId} row={row} run={run} />,
    },
  ];

  return (
    <DataTable
      columns={columns}
      empty={<EventsEmpty isFiltered={isFiltered} />}
      onSortChange={onSortChange}
      order={order}
      rowKey={(row) => row.id}
      rows={rows}
      sort={sort}
    />
  );
}

type RunAction = (
  action: () => Promise<{ ok: true } | { ok: false; error: string }>,
  successMessage: string,
) => Promise<boolean>;

function RowActions({
  orgId,
  row,
  onEdit,
  run,
}: {
  orgId: string;
  row: OrgEventRow;
  onEdit: (row: OrgEventRow) => void;
  run: RunAction;
}): React.ReactElement | null {
  // cancelled / completed 是终态，没有任何后续动作
  if (row.status === "cancelled" || row.status === "completed") {
    return null;
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        aria-label={`Edit ${row.title}`}
        onClick={() => onEdit(row)}
        size="icon"
        variant="ghost"
      >
        <PencilSimpleIcon />
      </Button>

      {row.status === "draft" ? (
        <>
          {/* 发布不可逆（状态机只允许 published → cancelled/completed），且立刻对家长可见，所以要确认 */}
          <ConfirmDialog
            confirmLabel="Publish"
            description="Families in the audience will see this event right away. A published event cannot go back to draft."
            onConfirm={() =>
              run(
                () => transitionEvent({ data: { eventId: row.id, orgId, status: "published" } }),
                "Event published",
              )
            }
            title={`Publish ${row.title}?`}
            trigger={
              <Button aria-label={`Publish ${row.title}`} size="icon" variant="ghost">
                <PaperPlaneTiltIcon />
              </Button>
            }
          />
          <ConfirmDialog
            confirmLabel="Delete"
            description="This draft and everything attached to it will be removed. This cannot be undone."
            destructive
            onConfirm={() =>
              run(() => deleteDraftEvent({ data: { eventId: row.id, orgId } }), "Event deleted")
            }
            title={`Delete ${row.title}?`}
            trigger={
              <Button aria-label={`Delete ${row.title}`} size="icon" variant="ghost">
                <TrashIcon />
              </Button>
            }
          />
        </>
      ) : (
        <>
          <ConfirmDialog
            confirmLabel="Mark completed"
            description="Completed events stay visible in the history but can no longer change."
            onConfirm={() =>
              run(
                () => transitionEvent({ data: { eventId: row.id, orgId, status: "completed" } }),
                "Event completed",
              )
            }
            title={`Mark ${row.title} as completed?`}
            trigger={
              <Button aria-label={`Mark ${row.title} as completed`} size="icon" variant="ghost">
                <CheckCircleIcon />
              </Button>
            }
          />
          <ConfirmDialog
            confirmLabel="Cancel event"
            description="Families keep seeing the event, marked as cancelled. This cannot be undone."
            destructive
            onConfirm={() =>
              run(
                () => transitionEvent({ data: { eventId: row.id, orgId, status: "cancelled" } }),
                "Event cancelled",
              )
            }
            title={`Cancel ${row.title}?`}
            trigger={
              <Button aria-label={`Cancel ${row.title}`} size="icon" variant="ghost">
                <ProhibitIcon />
              </Button>
            }
          />
        </>
      )}
    </div>
  );
}

function EventsEmpty({ isFiltered }: { isFiltered: boolean }): React.ReactElement {
  return (
    <Empty className="py-12 md:py-12">
      <EmptyHeader>
        <EmptyTitle>{isFiltered ? "No matching events" : "No events yet"}</EmptyTitle>
        <EmptyDescription>
          {isFiltered
            ? "Try a different search, status or time range."
            : "Create your first event as a draft, then publish it when the details are final."}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
