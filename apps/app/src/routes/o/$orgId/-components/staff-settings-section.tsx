import { Badge } from "@everband/ui/components/badge";
import { Button } from "@everband/ui/components/button";
import { Field, FieldDescription, FieldLabel } from "@everband/ui/components/field";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@everband/ui/components/frame";
import { Input } from "@everband/ui/components/input";
import { PlusIcon } from "@phosphor-icons/react";
import type React from "react";
import { useState } from "react";
import { DataTable, type DataTableColumn } from "~/components/data-table/data-table.tsx";
import { FormDrawer } from "~/components/form-drawer.tsx";
import { useServerFormAction } from "~/hooks/use-server-form-action.ts";
import { inviteStaff, type listOrgMemberships } from "~/server/org.ts";

type StaffRow = Awaited<ReturnType<typeof listOrgMemberships>>[number];

export function StaffSettingsSection({
  orgId,
  members,
}: {
  orgId: string;
  members: StaffRow[];
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
      render: (row) => <span className="capitalize">{row.role}</span>,
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
        <Button onClick={() => setIsOpen(true)}>
          <PlusIcon />
          Invite staff
        </Button>
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
