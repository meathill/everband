import { formatOrgDateTime } from "@everband/domain";
import { Badge } from "@everband/ui/components/badge";
import { Button } from "@everband/ui/components/button";
import {
  Drawer,
  DrawerClose,
  DrawerDescription,
  DrawerHeader,
  DrawerPanel,
  DrawerPopup,
  DrawerTitle,
} from "@everband/ui/components/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@everband/ui/components/tabs";
import { useEffect, useState } from "react";
import { DataTable, type DataTableColumn } from "~/components/data-table/data-table.tsx";
import { DataTablePagination } from "~/components/data-table/data-table-pagination.tsx";
import { DataTableToolbar } from "~/components/data-table/data-table-toolbar.tsx";
import { type ListSearchState, useListSearch } from "~/components/data-table/use-list-search.ts";
import { getEmailSendDetail, listEmailSendRecipients } from "~/server/notify.ts";
import type { EmailSendRow } from "./email-sends-table.tsx";

type RecipientsSearch = ListSearchState & { status?: string; opened?: string };

type RecipientRow = Awaited<ReturnType<typeof listEmailSendRecipients>>["items"][number];

function statusBadge(status: string) {
  if (status === "sent") return <Badge variant="default">sent</Badge>;
  if (status === "failed") return <Badge variant="destructive">failed</Badge>;
  if (status === "suppressed") return <Badge variant="secondary">suppressed</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function openedBadge(row: RecipientRow) {
  if (row.openedAt) return <Badge variant="default">opened ×{row.openCount}</Badge>;
  return <Badge variant="outline">unopened</Badge>;
}

export function EmailSendDrawer({
  open,
  onOpenChange,
  orgId,
  send,
  timezone,
  isStaff,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  send: EmailSendRow | null;
  timezone: string;
  isStaff: boolean;
}): React.ReactElement {
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getEmailSendDetail>> | null>(null);
  const [recipients, setRecipients] = useState<{
    items: RecipientRow[];
    total: number;
    page: number;
    pageSize: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  // recipients 分页/搜索状态（仅 staff 可过滤，家长只看自己一行）
  const [search, setSearch] = useState({
    page: 1,
    pageSize: 20,
    sort: "email" as string,
    order: "asc" as const,
    q: undefined as string | undefined,
    status: undefined as string | undefined,
    opened: undefined as string | undefined,
  });

  const list = useListSearch<RecipientsSearch>({
    search: search as RecipientsSearch,
    onChange: (patch) => setSearch((prev) => ({ ...prev, ...(patch as Partial<typeof search>) })),
  });

  useEffect(() => {
    if (!open || !send) {
      setDetail(null);
      setRecipients(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getEmailSendDetail({ data: { orgId, sendId: send.id } })
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, send, orgId]);

  useEffect(() => {
    if (!open || !send) return;
    let cancelled = false;
    listEmailSendRecipients({
      data: {
        orgId,
        sendId: send.id,
        page: search.page,
        pageSize: search.pageSize,
        sort: search.sort as "email" | "status" | "sentAt" | "openedAt",
        order: search.order,
        q: search.q,
        status: search.status as "queued" | "sent" | "failed" | "suppressed" | undefined,
        opened: search.opened as "opened" | "unopened" | undefined,
      },
    }).then((res) => {
      if (!cancelled) setRecipients(res);
    });
    return () => {
      cancelled = true;
    };
  }, [open, send, orgId, search]);

  const currentSend = detail?.send ?? send;

  const recipientColumns: DataTableColumn<RecipientRow>[] = [
    {
      key: "email",
      header: "Email",
      sortable: true,
      render: (r) => <span className="truncate">{r.email}</span>,
    },
    { key: "status", header: "Status", sortable: true, render: (r) => statusBadge(r.status) },
    {
      key: "openedAt",
      header: "Opened",
      sortable: true,
      render: (r) => (
        <span className="flex items-center gap-2">
          {openedBadge(r)}
          {r.lastOpenedAt ? (
            <span className="text-muted-foreground text-xs tabular-nums">
              {formatOrgDateTime(r.lastOpenedAt, timezone)}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "error",
      header: "Error",
      render: (r) =>
        r.error ? (
          <span className="text-destructive text-xs">{r.error}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "sentAt",
      header: "Sent",
      sortable: true,
      render: (r) =>
        r.sentAt ? (
          <span className="tabular-nums text-xs">{formatOrgDateTime(r.sentAt, timezone)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <Drawer open={open} onOpenChange={onOpenChange} position="right">
      <DrawerPopup className="w-full sm:max-w-xl">
        <DrawerHeader>
          <DrawerTitle>{currentSend?.subject ?? "Email detail"}</DrawerTitle>
          <DrawerDescription>
            {currentSend
              ? `${currentSend.kind} · ${currentSend.status} · ${formatOrgDateTime(currentSend.createdAt, timezone)}`
              : "Loading…"}
          </DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 flex-1 touch-auto overflow-y-auto">
          <DrawerPanel scrollable={false}>
            {loading && !currentSend ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : currentSend ? (
              <div className="flex flex-col gap-6">
                {/* Meta */}
                <section className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant={
                        currentSend.status === "succeeded"
                          ? "default"
                          : currentSend.status === "failed"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {currentSend.status}
                    </Badge>
                    <Badge variant="outline">{currentSend.kind}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                    <span>
                      Recipients:{" "}
                      <span className="font-medium text-foreground tabular-nums">
                        {currentSend.recipientCount}
                      </span>
                    </span>
                    <span>
                      Sent:{" "}
                      <span className="font-medium text-foreground tabular-nums">
                        {currentSend.sentCount}
                      </span>
                    </span>
                    <span>
                      Failed:{" "}
                      <span className="font-medium text-foreground tabular-nums">
                        {currentSend.failedCount}
                      </span>
                    </span>
                    <span>
                      Opted out:{" "}
                      <span className="font-medium text-foreground tabular-nums">
                        {currentSend.suppressedCount}
                      </span>
                    </span>
                  </div>
                  {currentSend.finishedAt ? (
                    <span className="text-muted-foreground text-xs">
                      Finished {formatOrgDateTime(currentSend.finishedAt, timezone)}
                    </span>
                  ) : null}
                  {currentSend.cc ? (
                    <span>
                      CC: <span className="text-foreground">{currentSend.cc}</span>
                    </span>
                  ) : null}
                  {isStaff && currentSend.bcc ? (
                    <span>
                      BCC: <span className="text-foreground">{currentSend.bcc}</span>
                    </span>
                  ) : null}
                </section>

                {/* Content */}
                <section className="flex flex-col gap-2">
                  <h3 className="font-medium text-sm">Content</h3>
                  <Tabs defaultValue="text">
                    <TabsList>
                      <TabsTrigger value="text">Text</TabsTrigger>
                      {currentSend.html ? <TabsTrigger value="html">HTML</TabsTrigger> : null}
                    </TabsList>
                    <TabsContent value="text">
                      <pre className="whitespace-pre-wrap break-words rounded-lg border bg-muted/30 p-3 text-sm">
                        {currentSend.body}
                      </pre>
                    </TabsContent>
                    {currentSend.html ? (
                      <TabsContent value="html">
                        <div
                          className="prose prose-sm max-w-none rounded-lg border bg-card p-3"
                          // biome-ignore lint/security/noDangerouslySetInnerHtml: 邮件 HTML 来自受信任编辑器（TipTap），仅 staff 可见
                          dangerouslySetInnerHTML={{ __html: currentSend.html }}
                        />
                        <p className="mt-2 text-muted-foreground text-xs">
                          HTML preview — actual delivery may vary by client.
                        </p>
                      </TabsContent>
                    ) : null}
                  </Tabs>
                </section>

                {/* Recipients */}
                <section className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-sm">Recipients</h3>
                    <span className="text-muted-foreground text-xs">
                      Open tracking via 1×1 pixel — Apple Mail may prefetch; Outlook may block. For
                      reference only.
                    </span>
                  </div>

                  {isStaff ? (
                    <DataTableToolbar
                      defaultQuery={search.q}
                      onQueryChange={list.setQuery}
                      searchPlaceholder="Search email"
                    >
                      <select
                        className="h-9 rounded-md border bg-card px-2 text-sm"
                        onChange={(e) => list.setFilter("status", e.target.value || undefined)}
                        value={search.status ?? ""}
                      >
                        <option value="">All status</option>
                        <option value="sent">sent</option>
                        <option value="failed">failed</option>
                        <option value="queued">queued</option>
                        <option value="suppressed">suppressed</option>
                      </select>
                      <select
                        className="h-9 rounded-md border bg-card px-2 text-sm"
                        onChange={(e) => list.setFilter("opened", e.target.value || undefined)}
                        value={search.opened ?? ""}
                      >
                        <option value="">All</option>
                        <option value="opened">opened</option>
                        <option value="unopened">unopened</option>
                      </select>
                    </DataTableToolbar>
                  ) : null}

                  <DataTable
                    columns={recipientColumns}
                    onSortChange={list.setSort}
                    order={search.order}
                    rowKey={(r) => r.id}
                    rows={recipients?.items ?? []}
                    sort={search.sort}
                    empty={
                      <p className="py-8 text-center text-muted-foreground text-sm">
                        No recipients
                      </p>
                    }
                  />
                  {recipients ? (
                    <DataTablePagination
                      onPageChange={list.setPage}
                      page={recipients.page}
                      pageSize={recipients.pageSize}
                      total={recipients.total}
                    />
                  ) : null}
                </section>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Not found</p>
            )}
          </DrawerPanel>
        </div>

        <div className="flex justify-end border-t p-4">
          <DrawerClose render={<Button variant="outline" />}>Close</DrawerClose>
        </div>
      </DrawerPopup>
    </Drawer>
  );
}
