import { Badge } from "@everband/ui/components/badge";
import { Button } from "@everband/ui/components/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@everband/ui/components/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@everband/ui/components/select";
import { toastManager } from "@everband/ui/components/toast";
import type { GroupStatusFilter } from "@everband/validation";
import { GROUP_STATUS_FILTERS, groupsListSchema } from "@everband/validation";
import {
  ArchiveIcon,
  ArrowCounterClockwiseIcon,
  PencilSimpleIcon,
  PlusIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import type React from "react";
import { useState } from "react";
import { ConfirmDialog } from "~/components/confirm-dialog.tsx";
import { DataTableToolbar } from "~/components/data-table/data-table-toolbar.tsx";
import { listGroups, updateGroup } from "~/server/members.ts";
import { GroupFormDrawer, type GroupFormValues } from "./-components/group-form-drawer.tsx";
import { GroupMembersDrawer } from "./-components/group-members-drawer.tsx";

export const Route = createFileRoute("/o/$orgId/groups")({
  validateSearch: groupsListSchema,
  // 漏了 loaderDeps，切换状态筛选就不会重跑 loader
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    try {
      return { groups: await listGroups({ data: { orgId: params.orgId, status: deps.status } }) };
    } catch {
      throw redirect({ to: "/o/$orgId", params: { orgId: params.orgId } });
    }
  },
  component: GroupsPage,
});

type GroupRow = Awaited<ReturnType<typeof listGroups>>[number];

const STATUS_LABELS: Record<GroupStatusFilter, string> = {
  active: "Active",
  archived: "Archived",
  all: "All groups",
};

function GroupsPage(): React.ReactElement {
  const { groups } = Route.useLoaderData();
  const { orgId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<GroupFormValues | undefined>(undefined);
  const [membersGroup, setMembersGroup] = useState<{ id: string; name: string } | null>(null);

  function openCreate() {
    setEditing(undefined);
    setIsDrawerOpen(true);
  }

  function openRename(group: GroupRow) {
    setEditing({ id: group.id, name: group.name });
    setIsDrawerOpen(true);
  }

  function openMembers(group: GroupRow) {
    setMembersGroup({ id: group.id, name: group.name });
  }

  // 行内操作：失败弹错误 toast 且不关闭确认框，成功刷新 loader 后再 toast
  async function run(status: "active" | "archived", group: GroupRow): Promise<boolean> {
    const result = await updateGroup({ data: { orgId, groupId: group.id, status } });
    if (!result.ok) {
      toastManager.add({ title: result.error, type: "error" });
      return false;
    }
    await router.invalidate();
    toastManager.add({
      title: status === "archived" ? "Group archived" : "Group restored",
      type: "success",
    });
    return true;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-semibold text-3xl text-foreground tracking-tight">Groups</h1>

      <DataTableToolbar
        actions={
          <Button onClick={openCreate}>
            <PlusIcon />
            New group
          </Button>
        }
        onRefresh={() => router.invalidate()}
      >
        <Select
          items={STATUS_LABELS}
          onValueChange={(value: GroupStatusFilter | null) =>
            value && navigate({ replace: true, search: { status: value } })
          }
          value={search.status}
        >
          <SelectTrigger aria-label="Filter by status" className="w-auto min-w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GROUP_STATUS_FILTERS.map((value) => (
              <SelectItem key={value} value={value}>
                {STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </DataTableToolbar>

      {groups.length === 0 ? (
        <GroupsEmpty status={search.status} />
      ) : (
        <ul className="flex max-w-xl flex-col gap-2">
          {groups.map((group) => (
            <li
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm"
              key={group.id}
            >
              <span className="flex items-center gap-2">
                <span className="font-medium text-foreground">{group.name}</span>
                {group.status === "archived" && <Badge variant="secondary">Archived</Badge>}
              </span>
              <GroupActions group={group} onMembers={openMembers} onRename={openRename} run={run} />
            </li>
          ))}
        </ul>
      )}

      <GroupFormDrawer
        group={editing}
        onOpenChange={setIsDrawerOpen}
        open={isDrawerOpen}
        orgId={orgId}
      />
      <GroupMembersDrawer
        group={membersGroup}
        onOpenChange={(open) => !open && setMembersGroup(null)}
        open={membersGroup !== null}
        orgId={orgId}
      />
    </div>
  );
}

function GroupActions({
  group,
  onMembers,
  onRename,
  run,
}: {
  group: GroupRow;
  onMembers: (group: GroupRow) => void;
  onRename: (group: GroupRow) => void;
  run: (status: "active" | "archived", group: GroupRow) => Promise<boolean>;
}): React.ReactElement {
  return (
    <span className="flex items-center gap-1">
      <Button
        aria-label={`Members of ${group.name}`}
        onClick={() => onMembers(group)}
        size="icon"
        variant="ghost"
      >
        <UsersIcon />
      </Button>
      <Button
        aria-label={`Rename ${group.name}`}
        onClick={() => onRename(group)}
        size="icon"
        variant="ghost"
      >
        <PencilSimpleIcon />
      </Button>
      {group.status === "active" ? (
        <ConfirmDialog
          confirmLabel="Archive"
          description="Archived groups disappear from every picker. Students and upcoming events must be moved out first."
          destructive
          onConfirm={() => run("archived", group)}
          title={`Archive ${group.name}?`}
          trigger={
            <Button aria-label={`Archive ${group.name}`} size="icon" variant="ghost">
              <ArchiveIcon />
            </Button>
          }
        />
      ) : (
        <ConfirmDialog
          confirmLabel="Restore"
          description="The group becomes available again in every picker."
          onConfirm={() => run("active", group)}
          title={`Restore ${group.name}?`}
          trigger={
            <Button aria-label={`Restore ${group.name}`} size="icon" variant="ghost">
              <ArrowCounterClockwiseIcon />
            </Button>
          }
        />
      )}
    </span>
  );
}

function GroupsEmpty({ status }: { status: GroupStatusFilter }): React.ReactElement {
  return (
    <Empty className="py-12 md:py-12">
      <EmptyHeader>
        <EmptyTitle>{status === "archived" ? "No archived groups" : "No groups yet"}</EmptyTitle>
        <EmptyDescription>
          {status === "archived"
            ? "Groups you archive show up here."
            : "Groups organize students by band, section or class. Create the first one."}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
