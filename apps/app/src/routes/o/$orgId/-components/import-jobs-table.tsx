import { formatOrgDateTime } from "@everband/domain";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@everband/ui/components/empty";
import type React from "react";
import { DataTable, type DataTableColumn } from "~/components/data-table/data-table.tsx";
import type { listImportJobs } from "~/server/import.ts";

export type ImportJobRow = Awaited<ReturnType<typeof listImportJobs>>["items"][number];

export interface ImportJobsTableProps {
  rows: ImportJobRow[];
  timezone: string;
}

function statusClassName(status: string): string {
  if (status === "succeeded") return "text-success-foreground";
  if (status === "failed") return "text-destructive-foreground";
  return "text-muted-foreground";
}

export function ImportJobsTable({ rows, timezone }: ImportJobsTableProps): React.ReactElement {
  const columns: DataTableColumn<ImportJobRow>[] = [
    {
      key: "createdAt",
      header: "Started",
      render: (row) => (
        <span className="tabular-nums">{formatOrgDateTime(row.createdAt, timezone)}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <span className={statusClassName(row.status)}>{row.status}</span>,
    },
    {
      key: "totalRows",
      header: "Rows",
      render: (row) => <span className="tabular-nums">{row.totalRows}</span>,
    },
    {
      key: "createdCount",
      header: "Created",
      render: (row) => <span className="tabular-nums">{row.createdCount}</span>,
    },
    {
      key: "updatedCount",
      header: "Updated",
      render: (row) => <span className="tabular-nums">{row.updatedCount}</span>,
    },
    {
      key: "skippedCount",
      header: "Skipped",
      render: (row) => <span className="tabular-nums">{row.skippedCount}</span>,
    },
    {
      key: "failedCount",
      header: "Failed",
      render: (row) => <span className="tabular-nums">{row.failedCount}</span>,
    },
  ];

  return (
    <DataTable
      columns={columns}
      empty={
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No imports yet</EmptyTitle>
            <EmptyDescription>Upload a CSV above to add members in bulk.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      }
      rowKey={(row) => row.id}
      rows={rows}
    />
  );
}
