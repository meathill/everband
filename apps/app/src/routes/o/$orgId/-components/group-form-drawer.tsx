import { Field, FieldDescription, FieldLabel } from "@everband/ui/components/field";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@everband/ui/components/frame";
import { Input } from "@everband/ui/components/input";
import type React from "react";
import { FormDrawer } from "~/components/form-drawer.tsx";
import { useServerFormAction } from "~/hooks/use-server-form-action.ts";
import { createGroup, updateGroup } from "~/server/members.ts";

/** 编辑模式下回填用的分组快照；不传即创建模式 */
export interface GroupFormValues {
  id: string;
  name: string;
}

export interface GroupFormDrawerProps {
  orgId: string;
  group?: GroupFormValues;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 建组 / 改名共用的抽屉。非受控输入：受控输入在水合前的键入会被首个受控渲染清空。 */
export function GroupFormDrawer({
  orgId,
  group,
  open,
  onOpenChange,
}: GroupFormDrawerProps): React.ReactElement {
  const isEdit = group !== undefined;

  function close() {
    onOpenChange(false);
  }

  const create = useServerFormAction({
    action: createGroup,
    successMessage: "Group created",
    onSuccess: close,
  });
  const update = useServerFormAction({
    action: updateGroup,
    successMessage: "Group renamed",
    onSuccess: close,
  });
  const active = isEdit ? update : create;

  async function handleSubmit(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim();
    if (group) {
      await update.submit({ orgId, groupId: group.id, name });
      return;
    }
    await create.submit({ orgId, name });
  }

  return (
    <FormDrawer
      description={
        isEdit
          ? "The new name shows up everywhere the group is used."
          : "Groups organize students by band, section or class."
      }
      error={active.error}
      isBusy={active.isBusy}
      onOpenChange={onOpenChange}
      onSubmit={handleSubmit}
      open={open}
      submitLabel={isEdit ? "Save changes" : "Create group"}
      title={isEdit ? "Rename group" : "New group"}
    >
      <Frame>
        <FramePanel>
          <FrameHeader className="px-0 pt-0">
            <FrameTitle>Group details</FrameTitle>
          </FrameHeader>
          <Field>
            <FieldLabel htmlFor="group-name">Name</FieldLabel>
            <Input
              autoFocus
              defaultValue={group?.name}
              id="group-name"
              name="name"
              placeholder="Senior band"
              required
            />
            <FieldDescription>Up to 60 characters. Must be unique.</FieldDescription>
          </Field>
        </FramePanel>
      </Frame>
    </FormDrawer>
  );
}
