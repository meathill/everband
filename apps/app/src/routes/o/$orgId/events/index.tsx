import type { OrgEventRow } from "@everband/core";
import { formatOrgDateTime } from "@everband/domain";
import { Button } from "@everband/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@everband/ui/components/select";
import type { EventStatusFilter, EventTimeFilter } from "@everband/validation";
import { EVENT_STATUS_FILTERS, EVENT_TIME_FILTERS, eventsListSchema } from "@everband/validation";
import { PlusIcon } from "@phosphor-icons/react";
import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import type React from "react";
import { useState } from "react";
import { DataTablePagination } from "~/components/data-table/data-table-pagination.tsx";
import { DataTableToolbar } from "~/components/data-table/data-table-toolbar.tsx";
import { useListSearch } from "~/components/data-table/use-list-search.ts";
import { PageSkeleton } from "~/components/page-loaders.tsx";
import { getEventsPageData } from "~/server/events.ts";
import { EventFormDrawer } from "./-components/event-form-drawer.tsx";
import { StaffEventsTable } from "./-components/staff-events-table.tsx";

export const Route = createFileRoute("/o/$orgId/events/")({
  validateSearch: eventsListSchema,
  // 漏了 loaderDeps 就会"翻页/排序/搜索点了没反应"：loader 只在 params 变化时重跑
  loaderDeps: ({ search }) => search,
  loader: ({ params, deps }) => getEventsPageData({ data: { orgId: params.orgId, ...deps } }),
  component: EventsPage,
  pendingComponent: PageSkeleton,
});

const orgRoute = getRouteApi("/o/$orgId");

const STATUS_LABELS: Record<EventStatusFilter, string> = {
  all: "All statuses",
  cancelled: "Cancelled",
  completed: "Completed",
  draft: "Draft",
  published: "Published",
};

const TIME_LABELS: Record<EventTimeFilter, string> = {
  all: "Any time",
  past: "Past",
  upcoming: "Upcoming",
};

function EventsPage(): React.ReactElement {
  const data = Route.useLoaderData();
  const { org } = orgRoute.useLoaderData();
  return data.mode === "staff" ? (
    <StaffEvents list={data.list} timezone={org.timezone} />
  ) : (
    <ParentEvents timezone={org.timezone} upcoming={data.upcoming} />
  );
}

type StaffData = Extract<Awaited<ReturnType<typeof getEventsPageData>>, { mode: "staff" }>;

function StaffEvents({
  list,
  timezone,
}: {
  list: StaffData["list"];
  timezone: string;
}): React.ReactElement {
  const { orgId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const listSearch = useListSearch({
    search,
    onChange: (patch) => navigate({ replace: true, search: (prev) => ({ ...prev, ...patch }) }),
  });

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<OrgEventRow | undefined>(undefined);

  function openCreate() {
    setEditing(undefined);
    setIsDrawerOpen(true);
  }

  function openEdit(row: OrgEventRow) {
    setEditing(row);
    setIsDrawerOpen(true);
  }

  const isFiltered = Boolean(search.q) || search.status !== "all" || search.time !== "all";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-semibold text-3xl text-foreground tracking-tight">Events</h1>

      <DataTableToolbar
        actions={
          <Button onClick={openCreate}>
            <PlusIcon />
            New event
          </Button>
        }
        defaultQuery={search.q}
        onQueryChange={listSearch.setQuery}
        searchPlaceholder="Search events"
      >
        {/* items 让 SelectValue 显示标签而不是原始值；筛选值是 URL 状态，所以这里是受控的 */}
        <Select
          items={STATUS_LABELS}
          onValueChange={(value: EventStatusFilter | null) =>
            value && listSearch.setFilter("status", value)
          }
          value={search.status}
        >
          <SelectTrigger aria-label="Filter by status" className="w-auto min-w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EVENT_STATUS_FILTERS.map((value) => (
              <SelectItem key={value} value={value}>
                {STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={TIME_LABELS}
          onValueChange={(value: EventTimeFilter | null) =>
            value && listSearch.setFilter("time", value)
          }
          value={search.time}
        >
          <SelectTrigger aria-label="Filter by time" className="w-auto min-w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EVENT_TIME_FILTERS.map((value) => (
              <SelectItem key={value} value={value}>
                {TIME_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </DataTableToolbar>

      <StaffEventsTable
        isFiltered={isFiltered}
        onEdit={openEdit}
        onSortChange={listSearch.setSort}
        order={search.order}
        orgId={orgId}
        rows={list.items}
        sort={search.sort}
        timezone={timezone}
      />

      <DataTablePagination
        onPageChange={listSearch.setPage}
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
      />

      <EventFormDrawer
        event={editing}
        onOpenChange={setIsDrawerOpen}
        open={isDrawerOpen}
        orgId={orgId}
        timezone={timezone}
      />
    </div>
  );
}

type ParentData = Extract<Awaited<ReturnType<typeof getEventsPageData>>, { mode: "parent" }>;

function ParentEvents({
  timezone,
  upcoming,
}: {
  timezone: string;
  upcoming: ParentData["upcoming"];
}): React.ReactElement {
  const { orgId } = Route.useParams();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-semibold text-3xl text-foreground tracking-tight">Upcoming events</h1>
      {upcoming.length === 0 ? (
        <p className="text-muted-foreground">Nothing scheduled in the next 30 days.</p>
      ) : (
        <ul className="flex max-w-2xl flex-col gap-3">
          {upcoming.map((event) => (
            <li key={event.id}>
              <Link
                className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 shadow-sm transition-shadow hover:shadow-md"
                params={{ eventId: event.id, orgId }}
                to="/o/$orgId/events/$eventId"
              >
                <div>
                  <p className="font-medium text-foreground">
                    {event.title}
                    {event.status === "cancelled" && (
                      <span className="ml-2 font-semibold text-destructive-foreground text-xs uppercase tracking-wide">
                        cancelled
                      </span>
                    )}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {formatOrgDateTime(event.startsAtUtc, timezone)}
                    {event.location ? ` · ${event.location}` : ""}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
