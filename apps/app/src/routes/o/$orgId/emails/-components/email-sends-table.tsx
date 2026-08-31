import { formatOrgDateTime } from "@everband/domain";
import type React from "react";
import { DataTable, type DataTableColumn } from "~/components/data-table/data-table.tsx";
import type { listEmailSends } from "~/server/notify.ts";

export type EmailSendRow = Awaited<ReturnType<typeof listEmailSends>>[number];

export interface EmailSendsTableProps {
  rows: EmailSendRow[];
  timezone: string;
  sort?: string;
  order?: "asc" | "desc";
  onSortChange?: (sort: string, order: "asc" | "desc") => void;
  onRowClick?: (row: EmailSendRow) => void;
}

function statusClassName(status: string): string {
  if (status === "succeeded") return "text-success-foreground";
  if (status === "failed") return "text-destructive-foreground";
  return "text-muted-foreground";
}

export function EmailSendsTable({
  rows,
  timezone,
  sort,
  order,
  onSortChange,
  onRowClick,
}: EmailSendsTableProps): React.ReactElement {
  const columns: DataTableColumn<EmailSendRow>[] = [
    {
      key: "createdAt",
      header: "Requested",
      sortable: true,
      defaultOrder: "desc",
      render: (row) => (
        <span className="tabular-nums">{formatOrgDateTime(row.createdAt, timezone)}</span>
      ),
    },
    {
      key: "subject",
      header: "Subject",
      sortable: true,
      render: (row) => <span className="truncate">{row.subject}</span>,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (row) => <span className={statusClassName(row.status)}>{row.status}</span>,
    },
    {
      key: "recipientCount",
      header: "Recipients",
      render: (row) => <span className="tabular-nums">{row.recipientCount}</span>,
    },
    {
      key: "sentCount",
      header: "Sent",
      render: (row) => <span className="tabular-nums">{row.sentCount}</span>,
    },
    {
      key: "failedCount",
      header: "Failed",
      render: (row) => <span className="tabular-nums">{row.failedCount}</span>,
    },
    {
      key: "suppressedCount",
      header: "Opted out",
      render: (row) => <span className="tabular-nums">{row.suppressedCount}</span>,
    },
  ];

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold text-foreground text-xl">Email history</h2>
      <p className="text-muted-foreground text-sm">
        Click a row to view content, CC/BCC, and per-recipient delivery &amp; open status. Queued
        means accepted, not delivered.
      </p>
      <DataTable
        columns={columns}
        onRowClick={onRowClick}
        onSortChange={onSortChange}
        order={order}
        rowKey={(row) => row.id}
        rows={rows}
        sort={sort}
      />
    </section>
  );
}
