import { Button } from "@everband/ui/components/button";
import { Field, FieldDescription, FieldLabel } from "@everband/ui/components/field";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@everband/ui/components/frame";
import { Input } from "@everband/ui/components/input";
import { PlusIcon } from "@phosphor-icons/react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { FormDrawer } from "~/components/form-drawer.tsx";
import { useServerFormAction } from "~/hooks/use-server-form-action.ts";
import { createGroup, listGroups } from "~/server/members.ts";

export const Route = createFileRoute("/o/$orgId/groups")({
  loader: async ({ params }) => {
    try {
      return { groups: await listGroups({ data: { orgId: params.orgId } }) };
    } catch {
      throw redirect({ to: "/o/$orgId", params: { orgId: params.orgId } });
    }
  },
  component: GroupsPage,
});

function GroupsPage() {
  const { groups } = Route.useLoaderData();
  const { orgId } = Route.useParams();
  const [isOpen, setIsOpen] = useState(false);
  const { error, isBusy, submit, reset } = useServerFormAction({
    action: createGroup,
    successMessage: "Group created",
    onSuccess: () => setIsOpen(false),
  });

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    if (!open) {
      reset();
    }
  }

  // 非受控输入：受控输入在水合前的键入会被首个受控渲染清空
  async function handleSubmit(formData: FormData) {
    await submit({ orgId, name: String(formData.get("name") ?? "") });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Groups</h1>
        <Button onClick={() => handleOpenChange(true)}>
          <PlusIcon />
          New group
        </Button>
      </div>

      {groups.length === 0 ? (
        <p className="text-muted-foreground">No groups yet. Active students must belong to one.</p>
      ) : (
        <ul className="flex max-w-md flex-col gap-2">
          {groups.map((group) => (
            <li
              key={group.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 shadow-sm"
            >
              <span className="font-medium text-foreground">{group.name}</span>
              <span className="text-xs text-muted-foreground capitalize">{group.status}</span>
            </li>
          ))}
        </ul>
      )}

      <FormDrawer
        error={error}
        isBusy={isBusy}
        onOpenChange={handleOpenChange}
        onSubmit={handleSubmit}
        open={isOpen}
        submitLabel="Create group"
        title="New group"
        description="Groups organize students by band, section or class."
      >
        <Frame>
          <FramePanel>
            <FrameHeader className="px-0 pt-0">
              <FrameTitle>Group details</FrameTitle>
            </FrameHeader>
            <Field>
              <FieldLabel htmlFor="group-name">Name</FieldLabel>
              <Input id="group-name" name="name" required autoFocus placeholder="Senior band" />
              <FieldDescription>Up to 60 characters. Must be unique.</FieldDescription>
            </Field>
          </FramePanel>
        </Frame>
      </FormDrawer>
    </div>
  );
}
