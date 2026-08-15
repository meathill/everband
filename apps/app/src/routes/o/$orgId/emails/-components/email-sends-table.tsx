import { formatOrgDateTime } from "@everband/domain";
import type React from "react";
import { DataTable, type DataTableColumn } from "~/components/data-table/data-table.tsx";
import type { listEmailSends } from "~/server/notify.ts";

export type EmailSendRow = Awaited<ReturnType<typeof listEmailSends>>[number];

export interface EmailSendsTableProps {
  rows: EmailSendRow[];
  timezone: string;
}

function statusClassName(status: string): string {
  if (status === "succeeded") return "text-success-foreground";
  if (status === "failed") return "text-destructive-foreground";
  return "text-muted-foreground";
}

/**
 * staff 的邮件发送历史。刻意不做分页：它和通知收件箱共用一个 URL，两套分页参数会让
 * 链接难以理解，而这块只是排障用的近况面板——固定展示最近 50 条并在文案里说明。
 */
export function EmailSendsTable({ rows, timezone }: EmailSendsTableProps): React.ReactElement {
  const columns: DataTableColumn<EmailSendRow>[] = [
    {
      key: "createdAt",
      header: "Requested",
      render: (row) => (
        <span className="tabular-nums">{formatOrgDateTime(row.createdAt, timezone)}</span>
      ),
    },
    { key: "subject", header: "Subject", render: (row) => row.subject },
    {
      key: "status",
      header: "Status",
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
        Queued means the job was accepted — it does not mean delivered. Watch the per-send counts
        below. Showing the latest 50 sends.
      </p>
      <DataTable columns={columns} rowKey={(row) => row.id} rows={rows} />
    </section>
  );
}
