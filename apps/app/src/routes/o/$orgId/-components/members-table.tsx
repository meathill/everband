import type { OrgStudentRow, StudentContactRow } from "@everband/core";
import type { StudentStatus } from "@everband/domain";
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
import type { SortOrder } from "@everband/validation";
import { STUDENT_STATUS_VALUES } from "@everband/validation";
import { ArchiveIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";
import type React from "react";
import { ConfirmDialog } from "~/components/confirm-dialog.tsx";
import { DataTable, type DataTableColumn } from "~/components/data-table/data-table.tsx";
import { inviteParent, updateStudentStatus } from "~/server/members.ts";
import { STUDENT_STATUS_LABELS } from "./member-form-drawer.tsx";

export interface MembersTableProps {
  orgId: string;
  rows: OrgStudentRow[];
  sort: string;
  order: SortOrder;
  onSortChange: (sort: string, order: SortOrder) => void;
  onEdit: (row: OrgStudentRow) => void;
  /** 有筛选条件时空态文案不同：没有结果 ≠ 还没录过学生 */
  isFiltered: boolean;
}

type RunAction = (
  action: () => Promise<{ ok: true } | { ok: false; error: string }>,
  successMessage: string,
) => Promise<boolean>;

export function MembersTable({
  orgId,
  rows,
  sort,
  order,
  onSortChange,
  onEdit,
  isFiltered,
}: MembersTableProps): React.ReactElement {
  const router = useRouter();

  // 行内操作统一走这条路径：失败弹错误 toast，成功刷新 loader 后再 toast
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

  const columns: DataTableColumn<OrgStudentRow>[] = [
    {
      className: "font-medium text-foreground",
      defaultOrder: "asc",
      header: "Student",
      key: "name",
      render: (row) => row.name,
      sortable: true,
    },
    {
      defaultOrder: "asc",
      header: "Status",
      key: "status",
      render: (row) => <StatusCell orgId={orgId} row={row} run={run} />,
      sortable: true,
    },
    {
      header: "Contacts",
      key: "contacts",
      render: (row) => <ContactsCell contacts={row.contacts} orgId={orgId} run={run} />,
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
      empty={<MembersEmpty isFiltered={isFiltered} />}
      onSortChange={onSortChange}
      order={order}
      rowKey={(row) => row.id}
      rows={rows}
      sort={sort}
    />
  );
}

function StatusCell({
  orgId,
  row,
  run,
}: {
  orgId: string;
  row: OrgStudentRow;
  run: RunAction;
}): React.ReactElement {
  // archived 是终态，状态机不允许再变
  if (row.status === "archived") {
    return <span className="text-muted-foreground text-sm">Archived</span>;
  }
  return (
    <Select
      items={STUDENT_STATUS_LABELS}
      onValueChange={(value: StudentStatus | null) =>
        value &&
        value !== row.status &&
        run(
          () => updateStudentStatus({ data: { orgId, studentId: row.id, status: value } }),
          "Status updated",
        )
      }
      value={row.status}
    >
      <SelectTrigger aria-label={`Status for ${row.name}`} className="w-auto min-w-32" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STUDENT_STATUS_VALUES.map((value) => (
          <SelectItem key={value} value={value}>
            {STUDENT_STATUS_LABELS[value]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ContactsCell({
  contacts,
  orgId,
  run,
}: {
  contacts: StudentContactRow[];
  orgId: string;
  run: RunAction;
}): React.ReactElement {
  if (contacts.length === 0) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {contacts.map((contact) => (
        <li className="flex flex-wrap items-center gap-2 text-sm" key={contact.contactId}>
          <span className="text-foreground">{contact.contactName}</span>
          <span className="text-muted-foreground">{contact.contactEmail}</span>
          {contact.contactUserId ? (
            <span className="font-semibold text-success-foreground text-xs uppercase tracking-wide">
              linked
            </span>
          ) : (
            <Button
              onClick={() =>
                run(
                  () => inviteParent({ data: { orgId, contactId: contact.contactId } }),
                  "Invitation sent",
                )
              }
              size="xs"
              variant="outline"
            >
              Invite parent
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

function RowActions({
  onEdit,
  orgId,
  row,
  run,
}: {
  onEdit: (row: OrgStudentRow) => void;
  orgId: string;
  row: OrgStudentRow;
  run: RunAction;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        aria-label={`Edit ${row.name}`}
        onClick={() => onEdit(row)}
        size="icon"
        variant="ghost"
      >
        <PencilSimpleIcon />
      </Button>
      {row.status !== "archived" && (
        // 归档是终态：状态机不允许再改回来，所以要二次确认
        <ConfirmDialog
          confirmLabel="Archive"
          description="Archived students drop out of the default list and cannot be restored."
          destructive
          onConfirm={() =>
            run(
              () => updateStudentStatus({ data: { orgId, status: "archived", studentId: row.id } }),
              "Student archived",
            )
          }
          title={`Archive ${row.name}?`}
          trigger={
            <Button aria-label={`Archive ${row.name}`} size="icon" variant="ghost">
              <ArchiveIcon />
            </Button>
          }
        />
      )}
    </div>
  );
}

function MembersEmpty({ isFiltered }: { isFiltered: boolean }): React.ReactElement {
  return (
    <Empty className="py-12 md:py-12">
      <EmptyHeader>
        <EmptyTitle>{isFiltered ? "No matching students" : "No students yet"}</EmptyTitle>
        <EmptyDescription>
          {isFiltered
            ? "Try a different search or status."
            : "Add a student, or import a roster from a CSV file."}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
