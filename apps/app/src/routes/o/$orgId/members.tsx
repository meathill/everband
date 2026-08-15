import type { OrgStudentRow } from "@everband/core";
import { Button } from "@everband/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@everband/ui/components/select";
import type { StudentStatusFilter } from "@everband/validation";
import { STUDENT_STATUS_FILTERS, studentsListSchema } from "@everband/validation";
import { PlusIcon } from "@phosphor-icons/react";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import type React from "react";
import { useState } from "react";
import { DataTablePagination } from "~/components/data-table/data-table-pagination.tsx";
import { DataTableToolbar } from "~/components/data-table/data-table-toolbar.tsx";
import { useListSearch } from "~/components/data-table/use-list-search.ts";
import { PageSkeleton } from "~/components/page-loaders.tsx";
import { listGroups, listStudents } from "~/server/members.ts";
import { MemberFormDrawer } from "./-components/member-form-drawer.tsx";
import { MembersTable } from "./-components/members-table.tsx";

export const Route = createFileRoute("/o/$orgId/members")({
  validateSearch: studentsListSchema,
  // 漏了 loaderDeps 就会"翻页/排序/搜索点了没反应"：loader 只在 params 变化时重跑
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    try {
      const [list, groups] = await Promise.all([
        listStudents({ data: { orgId: params.orgId, ...deps } }),
        // 分组下拉只列在用的分组
        listGroups({ data: { orgId: params.orgId, status: "active" } }),
      ]);
      return { list, groups };
    } catch {
      throw redirect({ to: "/o/$orgId", params: { orgId: params.orgId } });
    }
  },
  component: MembersPage,
  pendingComponent: PageSkeleton,
});

const STATUS_LABELS: Record<StudentStatusFilter, string> = {
  all: "All students",
  active: "Active",
  archived: "Archived",
  interested: "Interested",
  withdrawn: "Withdrawn",
};

const ALL_GROUPS = "all";
const UNASSIGNED_GROUPS = "unassigned";

function MembersPage(): React.ReactElement {
  const { list, groups } = Route.useLoaderData();
  const { orgId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const listSearch = useListSearch({
    search,
    onChange: (patch) => navigate({ replace: true, search: (prev) => ({ ...prev, ...patch }) }),
  });

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<OrgStudentRow | undefined>(undefined);

  function openCreate() {
    setEditing(undefined);
    setIsDrawerOpen(true);
  }

  function openEdit(row: OrgStudentRow) {
    setEditing(row);
    setIsDrawerOpen(true);
  }

  const groupLabels: Record<string, string> = {
    [ALL_GROUPS]: "All groups",
    [UNASSIGNED_GROUPS]: "Unassigned",
  };
  for (const group of groups) {
    groupLabels[group.id] = group.name;
  }
  const isFiltered =
    Boolean(search.q) ||
    search.status !== "all" ||
    (search.group !== ALL_GROUPS && search.group !== UNASSIGNED_GROUPS);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-semibold text-3xl text-foreground tracking-tight">Members</h1>

      <DataTableToolbar
        actions={
          <Button onClick={openCreate}>
            <PlusIcon />
            Add student
          </Button>
        }
        defaultQuery={search.q}
        onQueryChange={listSearch.setQuery}
        onRefresh={() => router.invalidate()}
        searchPlaceholder="Search students"
      >
        {/* 筛选值是 URL 状态，所以这些 Select 是受控的；items 让 SelectValue 显示标签 */}
        <Select
          items={STATUS_LABELS}
          onValueChange={(value: StudentStatusFilter | null) =>
            value && listSearch.setFilter("status", value)
          }
          value={search.status}
        >
          <SelectTrigger aria-label="Filter by status" className="w-auto min-w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STUDENT_STATUS_FILTERS.map((value) => (
              <SelectItem key={value} value={value}>
                {STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={groupLabels}
          onValueChange={(value: string | null) => value && listSearch.setFilter("group", value)}
          value={groupLabels[search.group] ? search.group : ALL_GROUPS}
        >
          <SelectTrigger aria-label="Filter by group" className="w-auto min-w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_GROUPS}>All groups</SelectItem>
            <SelectItem value={UNASSIGNED_GROUPS}>Unassigned</SelectItem>
            {groups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </DataTableToolbar>

      <MembersTable
        groups={groups}
        isFiltered={isFiltered}
        onEdit={openEdit}
        onSortChange={listSearch.setSort}
        order={search.order}
        orgId={orgId}
        rows={list.items}
        sort={search.sort}
      />

      <DataTablePagination
        onPageChange={listSearch.setPage}
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
      />

      <MemberFormDrawer
        groups={groups}
        onOpenChange={setIsDrawerOpen}
        open={isDrawerOpen}
        orgId={orgId}
        student={editing}
      />
    </div>
  );
}
