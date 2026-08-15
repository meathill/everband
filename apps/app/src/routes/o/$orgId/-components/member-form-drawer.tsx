import { Field, FieldDescription, FieldLabel } from "@everband/ui/components/field";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@everband/ui/components/frame";
import { Input } from "@everband/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@everband/ui/components/select";
import { RELATIONSHIPS, STUDENT_STATUS_VALUES } from "@everband/validation";
import type React from "react";
import { FormDrawer } from "~/components/form-drawer.tsx";
import { useServerFormAction } from "~/hooks/use-server-form-action.ts";
import { createStudent, updateStudent, updateStudentStatus } from "~/server/members.ts";

/** 编辑模式下回填用的学生快照；不传即创建模式 */
export interface MemberFormValues {
  id: string;
  name: string;
  groupId: string | null;
  status: (typeof STUDENT_STATUS_VALUES)[number];
}

export interface MemberFormGroup {
  id: string;
  name: string;
}

export interface MemberFormDrawerProps {
  orgId: string;
  groups: MemberFormGroup[];
  student?: MemberFormValues;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Select 不接受空字符串，用哨兵值表示"不分组" */
const NO_GROUP = "none";

export const STUDENT_STATUS_LABELS: Record<(typeof STUDENT_STATUS_VALUES)[number], string> = {
  active: "Active",
  archived: "Archived",
  interested: "Interested",
  withdrawn: "Withdrawn",
};

const RELATIONSHIP_LABELS: Record<(typeof RELATIONSHIPS)[number], string> = {
  emergency: "Emergency contact",
  guardian: "Guardian",
  parent: "Parent",
};

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 创建 / 编辑学生共用的抽屉。全部字段非受控（`name` + FormData 读值，Select 自带隐藏 input）。
 *
 * 编辑模式改状态/换组都收敛到这里（列表只读，避免误操作）；状态走状态机
 * （updateStudentStatusCore），姓名与分组走 updateStudent，联系人编辑不在本期范围内。
 */
export function MemberFormDrawer({
  orgId,
  groups,
  student,
  open,
  onOpenChange,
}: MemberFormDrawerProps): React.ReactElement {
  const isEdit = student !== undefined;

  function close() {
    onOpenChange(false);
  }

  const create = useServerFormAction({
    action: createStudent,
    successMessage: "Student added",
    onSuccess: close,
  });
  const update = useServerFormAction({
    action: updateStudent,
    successMessage: "Student updated",
    onSuccess: close,
  });
  const updateStatus = useServerFormAction({
    action: updateStudentStatus,
  });
  const active = isEdit ? update : create;

  async function handleSubmit(formData: FormData) {
    const selected = String(formData.get("groupId") ?? NO_GROUP);
    const groupId = selected === NO_GROUP ? null : selected;
    if (student) {
      const nextStatus = String(
        formData.get("status") ?? student.status,
      ) as (typeof STUDENT_STATUS_VALUES)[number];
      if (nextStatus !== student.status) {
        // 状态变更走状态机（含审计）；失败则不继续，错误显示在抽屉里
        const ok = await updateStatus.submit({
          orgId,
          studentId: student.id,
          status: nextStatus,
        });
        if (!ok) {
          return;
        }
      }
      await update.submit({ orgId, studentId: student.id, name: text(formData, "name"), groupId });
      return;
    }
    await create.submit({
      orgId,
      name: text(formData, "name"),
      status: String(formData.get("status") ?? "active") as (typeof STUDENT_STATUS_VALUES)[number],
      groupId: groupId ?? undefined,
      contact: {
        name: text(formData, "contactName"),
        email: text(formData, "contactEmail"),
        relationship: String(
          formData.get("relationship") ?? "parent",
        ) as (typeof RELATIONSHIPS)[number],
      },
    });
  }

  return (
    <FormDrawer
      description={
        isEdit
          ? "Update the student's name, status or group."
          : "Students need one contact. An existing contact with the same email is reused."
      }
      error={updateStatus.error ?? active.error}
      isBusy={updateStatus.isBusy || active.isBusy}
      onOpenChange={onOpenChange}
      onSubmit={handleSubmit}
      open={open}
      submitLabel={isEdit ? "Save changes" : "Add student"}
      title={isEdit ? "Edit student" : "New student"}
    >
      {/* 抽屉关闭时 Portal 卸载 children，非受控输入天然重置 */}
      <MemberFormFields groups={groups} student={student} />
    </FormDrawer>
  );
}

function MemberFormFields({
  groups,
  student,
}: {
  groups: MemberFormGroup[];
  student?: MemberFormValues;
}): React.ReactElement {
  const groupLabels: Record<string, string> = { [NO_GROUP]: "No group" };
  for (const group of groups) {
    groupLabels[group.id] = group.name;
  }
  // 已归档分组不在选项里，回落到"不分组"，保存时会显式移出
  const defaultGroup =
    student?.groupId && groupLabels[student.groupId] ? student.groupId : NO_GROUP;
  return (
    <Frame>
      <FramePanel>
        <FrameHeader className="px-0 pt-0">
          <FrameTitle>Student</FrameTitle>
        </FrameHeader>
        <Field>
          <FieldLabel htmlFor="student-name">Name</FieldLabel>
          <Input
            autoFocus
            defaultValue={student?.name}
            id="student-name"
            name="name"
            placeholder="Alex Chen"
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="student-status">Status</FieldLabel>
          <Select
            defaultValue={student?.status ?? "active"}
            disabled={student?.status === "archived"}
            items={STUDENT_STATUS_LABELS}
            name="status"
          >
            <SelectTrigger id="student-status">
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
          <FieldDescription>
            {student?.status === "archived"
              ? "Archived is a final state and can no longer change."
              : "Use status to keep the active roster accurate."}
          </FieldDescription>
        </Field>
      </FramePanel>

      {!student && (
        <FramePanel>
          <FrameHeader className="px-0 pt-0">
            <FrameTitle>Contacts</FrameTitle>
          </FrameHeader>
          <Field>
            <FieldLabel htmlFor="contact-name">Contact name</FieldLabel>
            <Input id="contact-name" name="contactName" placeholder="Jamie Chen" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="contact-email">Contact email</FieldLabel>
            <Input id="contact-email" name="contactEmail" required type="email" />
            <FieldDescription>
              Used to invite the family. An existing contact with this email is reused.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="contact-relationship">Relationship</FieldLabel>
            <Select defaultValue="parent" items={RELATIONSHIP_LABELS} name="relationship">
              <SelectTrigger id="contact-relationship">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RELATIONSHIPS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {RELATIONSHIP_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </FramePanel>
      )}

      <FramePanel>
        <FrameHeader className="px-0 pt-0">
          <FrameTitle>Group</FrameTitle>
        </FrameHeader>
        <Field>
          <FieldLabel htmlFor="student-group">Assigned group</FieldLabel>
          <Select defaultValue={defaultGroup} items={groupLabels} name="groupId">
            <SelectTrigger id="student-group">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_GROUP}>No group</SelectItem>
              {groups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {groups.length === 0 && (
            <FieldDescription>
              No active groups yet. Create one first, or leave students ungrouped.
            </FieldDescription>
          )}
        </Field>
      </FramePanel>
    </Frame>
  );
}
