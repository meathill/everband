import { Badge } from "@everband/ui/components/badge";
import { Button } from "@everband/ui/components/button";
import { Field, FieldDescription, FieldLabel } from "@everband/ui/components/field";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@everband/ui/components/frame";
import { Input } from "@everband/ui/components/input";
import { PlusIcon } from "@phosphor-icons/react";
import type React from "react";
import { useState } from "react";
import { ConfirmDialog } from "~/components/confirm-dialog.tsx";
import { DataTable, type DataTableColumn } from "~/components/data-table/data-table.tsx";
import { FormDrawer } from "~/components/form-drawer.tsx";
import { useServerFormAction } from "~/hooks/use-server-form-action.ts";
import {
  inviteStaff,
  type listOrgMemberships,
  setStaffAccess,
  transferOwnership,
} from "~/server/org.ts";

type StaffRow = Awaited<ReturnType<typeof listOrgMemberships>>[number];

export function StaffSettingsSection({
  orgId,
  members,
  isOwner,
}: {
  orgId: string;
  members: StaffRow[];
  isOwner: boolean;
}): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const invite = useServerFormAction({
    action: inviteStaff,
    successMessage: "Staff invitation sent",
    onSuccess: () => setIsOpen(false),
  });
  const columns: DataTableColumn<StaffRow>[] = [
    { header: "Email", key: "email", render: (row) => row.invitedEmail },
    {
      header: "Role",
      key: "role",
      render: (row) => <RoleCell row={row} />,
    },
    {
      header: "Status",
      key: "status",
      render: (row) => (
        <Badge className="capitalize" variant={row.status === "active" ? "success" : "secondary"}>
          {row.status}
        </Badge>
      ),
    },
    ...(isOwner
      ? [
          {
            header: "Actions",
            key: "actions",
            render: (row: StaffRow) => <RowActions isOwner={isOwner} orgId={orgId} row={row} />,
          },
        ]
      : []),
  ];

  async function handleSubmit(formData: FormData) {
    await invite.submit({ orgId, email: String(formData.get("email") ?? "").trim() });
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-foreground text-xl">Staff</h2>
          <p className="text-muted-foreground text-sm">People who can manage this organization.</p>
        </div>
        {isOwner && (
          <Button onClick={() => setIsOpen(true)}>
            <PlusIcon />
            Invite staff
          </Button>
        )}
      </div>

      <DataTable columns={columns} rowKey={(row) => row.id} rows={members} />

      <FormDrawer
        description="They receive a secure invitation by email."
        error={invite.error}
        isBusy={invite.isBusy}
        onOpenChange={setIsOpen}
        onSubmit={handleSubmit}
        open={isOpen}
        submitLabel="Send invitation"
        title="Invite staff"
      >
        <Frame>
          <FramePanel>
            <FrameHeader className="px-0 pt-0">
              <FrameTitle>Invitation</FrameTitle>
            </FrameHeader>
            <Field>
              <FieldLabel htmlFor="staff-email">Email</FieldLabel>
              <Input autoFocus id="staff-email" name="email" required type="email" />
              <FieldDescription>The invitation can only be used by this address.</FieldDescription>
            </Field>
          </FramePanel>
        </Frame>
      </FormDrawer>
    </section>
  );
}

function RoleCell({ row }: { row: StaffRow }): React.ReactElement {
  const isParentWithStaffAccess = row.role === "parent" && row.staffAccess;
  return (
    <div className="flex items-center gap-2">
      <span className="capitalize">{row.role}</span>
      {isParentWithStaffAccess && <Badge variant="secondary">staff access</Badge>}
    </div>
  );
}

function RowActions({
  isOwner,
  orgId,
  row,
}: {
  isOwner: boolean;
  orgId: string;
  row: StaffRow;
}): React.ReactElement | null {
  const grant = useServerFormAction({
    action: setStaffAccess,
    successMessage: "Staff access granted",
  });
  const revoke = useServerFormAction({
    action: setStaffAccess,
    successMessage: "Staff access revoked",
  });
  const transfer = useServerFormAction({
    action: transferOwnership,
    successMessage: "Ownership transferred",
  });

  // 只有 owner 能管理 staff（PRD §3.2）；非 active 成员不做任何操作
  if (!isOwner || row.status !== "active" || row.role === "owner") {
    return null;
  }

  async function handleToggleStaff(): Promise<void> {
    if (row.role !== "parent") {
      return;
    }
    if (row.staffAccess) {
      await revoke.submit({ orgId, membershipId: row.id, staffAccess: false });
    } else {
      await grant.submit({ orgId, membershipId: row.id, staffAccess: true });
    }
  }

  const canTransfer = row.role === "staff" || (row.role === "parent" && row.staffAccess);

  return (
    <div className="flex items-center gap-2">
      {row.role === "parent" && (
        <Button onClick={handleToggleStaff} size="sm" variant="outline">
          {row.staffAccess ? "Revoke staff access" : "Grant staff access"}
        </Button>
      )}
      {canTransfer && (
        <ConfirmDialog
          confirmLabel="Transfer ownership"
          description={`${row.invitedEmail} will become the new owner. You will become a staff member.`}
          onConfirm={() => transfer.submit({ orgId, membershipId: row.id })}
          title="Transfer ownership?"
          trigger={
            <Button size="sm" variant="outline">
              Transfer
            </Button>
          }
        />
      )}
    </div>
  );
}
