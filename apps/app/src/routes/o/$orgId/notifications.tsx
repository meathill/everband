import { formatOrgDateTime } from "@everband/domain";
import { Button } from "@everband/ui/components/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@everband/ui/components/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@everband/ui/components/select";
import type { NotificationFilter } from "@everband/validation";
import { NOTIFICATION_FILTERS, notificationsListSchema } from "@everband/validation";
import { ChecksIcon } from "@phosphor-icons/react";
import { createFileRoute, getRouteApi, Link, redirect } from "@tanstack/react-router";
import type React from "react";
import { useState } from "react";
import { DataTablePagination } from "~/components/data-table/data-table-pagination.tsx";
import { DataTableToolbar } from "~/components/data-table/data-table-toolbar.tsx";
import { useListSearch } from "~/components/data-table/use-list-search.ts";
import { useServerFormAction } from "~/hooks/use-server-form-action.ts";
import {
  listEmailSends,
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "~/server/notify.ts";
import { getOrgContext } from "~/server/org.ts";
import { EmailSendsTable } from "./-components/email-sends-table.tsx";

export const Route = createFileRoute("/o/$orgId/notifications")({
  validateSearch: notificationsListSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const orgId = params.orgId;
    try {
      const ctx = await getOrgContext({ data: { orgId } });
      const isStaff = ctx.role === "owner" || ctx.role === "staff";
      const [list, sends] = await Promise.all([
        listMyNotifications({ data: { orgId, ...deps } }),
        isStaff ? listEmailSends({ data: { orgId } }) : Promise.resolve([]),
      ]);
      // 这里刻意不再"进页面即全部标记已读"：那样 unread 筛选永远是空的，
      // 未读也就不再是一个用户能管理的状态。改为显式的行内 Mark read / 顶部 Mark all read。
      return { list, sends, isStaff };
    } catch {
      throw redirect({ to: "/o/$orgId", params: { orgId } });
    }
  },
  component: NotificationsPage,
});

const orgRoute = getRouteApi("/o/$orgId");

const FILTER_LABELS: Record<NotificationFilter, string> = {
  all: "All notifications",
  unread: "Unread only",
};

function NotificationsPage(): React.ReactElement {
  const { list, sends, isStaff } = Route.useLoaderData();
  const { org } = orgRoute.useLoaderData();
  const { orgId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const listSearch = useListSearch({
    search,
    onChange: (patch) => navigate({ replace: true, search: (prev) => ({ ...prev, ...patch }) }),
  });

  // 一个 hook 服务整行列表，用 pendingId 区分是哪一行在提交
  const [pendingId, setPendingId] = useState<string | null>(null);
  const markOne = useServerFormAction({ action: markNotificationRead });
  const markAll = useServerFormAction({
    action: markAllNotificationsRead,
    successMessage: "All notifications marked as read",
  });

  async function handleMarkRead(notificationId: string) {
    setPendingId(notificationId);
    try {
      await markOne.submit({ orgId, notificationId });
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h1 className="font-semibold text-3xl text-foreground tracking-tight">Notifications</h1>

        <DataTableToolbar
          actions={
            <Button
              disabled={list.unreadCount === 0}
              loading={markAll.isBusy}
              onClick={() => markAll.submit({ orgId })}
              variant="outline"
            >
              <ChecksIcon />
              Mark all read
            </Button>
          }
        >
          <Select
            items={FILTER_LABELS}
            onValueChange={(value: NotificationFilter | null) =>
              value && listSearch.setFilter("filter", value)
            }
            value={search.filter}
          >
            <SelectTrigger aria-label="Filter notifications" className="w-auto min-w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NOTIFICATION_FILTERS.map((value) => (
                <SelectItem key={value} value={value}>
                  {FILTER_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-sm tabular-nums">{list.unreadCount} unread</p>
        </DataTableToolbar>

        {list.items.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>
                {search.filter === "unread" ? "Nothing unread" : "No notifications yet"}
              </EmptyTitle>
              <EmptyDescription>
                {search.filter === "unread"
                  ? "You're all caught up."
                  : "Event updates and roster changes show up here."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex max-w-3xl flex-col gap-2">
            {list.items.map((notification) => (
              <li
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm shadow-sm"
                key={notification.id}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {!notification.readAt && (
                    <span
                      aria-label="Unread"
                      className="size-2 shrink-0 rounded-full bg-primary"
                      role="status"
                    />
                  )}
                  {notification.linkPath ? (
                    <Link
                      className="truncate font-medium text-foreground hover:text-primary"
                      to={notification.linkPath}
                    >
                      {notification.title}
                    </Link>
                  ) : (
                    <span className="truncate font-medium text-foreground">
                      {notification.title}
                    </span>
                  )}
                </div>
                <span className="text-muted-foreground tabular-nums">
                  {formatOrgDateTime(notification.createdAt, org.timezone)}
                </span>
                {!notification.readAt && (
                  <Button
                    loading={markOne.isBusy && pendingId === notification.id}
                    onClick={() => handleMarkRead(notification.id)}
                    size="sm"
                    variant="ghost"
                  >
                    Mark read
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        <DataTablePagination
          onPageChange={listSearch.setPage}
          page={list.page}
          pageSize={list.pageSize}
          total={list.total}
        />
        {(markOne.error || markAll.error) && (
          <p className="text-destructive-foreground text-sm" role="alert">
            {markOne.error ?? markAll.error}
          </p>
        )}
      </section>

      {isStaff && <EmailSendsTable rows={sends} timezone={org.timezone} />}
    </div>
  );
}
