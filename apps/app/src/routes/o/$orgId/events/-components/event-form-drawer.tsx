import type { EventStatus } from "@everband/domain";
import { utcMsToLocalDateTime } from "@everband/domain";
import { Checkbox } from "@everband/ui/components/checkbox";
import { Field, FieldDescription, FieldLabel } from "@everband/ui/components/field";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@everband/ui/components/frame";
import { Input } from "@everband/ui/components/input";
import { Textarea } from "@everband/ui/components/textarea";
import type React from "react";
import { useState } from "react";
import { FormDrawer } from "~/components/form-drawer.tsx";
import { useServerFormAction } from "~/hooks/use-server-form-action.ts";
import { createEvent, updateEvent } from "~/server/events.ts";

export interface EventFormGroup {
  id: string;
  name: string;
}

/** 编辑模式下回填用的活动快照；不传即创建模式 */
export interface EventFormValues {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAtUtc: number;
  endsAtUtc: number | null;
  isOrgWide: boolean;
  status: EventStatus;
  groupIds: string[];
}

export interface EventFormDrawerProps {
  orgId: string;
  /** 组织时区：datetime-local 的输入/回填都在这个时区下发生 */
  timezone: string;
  groups: EventFormGroup[];
  event?: EventFormValues;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 创建 / 编辑活动共用的抽屉。全部字段非受控（`name` + FormData 读值）。
 *
 * published 之后只放开 description / location / ends：标题与开始时间已经进过 parent 的
 * 邮件与日程，改了等于换了一个活动——服务端 `updateEventCore` 是同一套规则的唯一事实来源，
 * 这里的 disabled 只是把它前置成可见的界面状态。
 */
export function EventFormDrawer({
  orgId,
  timezone,
  groups,
  event,
  open,
  onOpenChange,
}: EventFormDrawerProps): React.ReactElement {
  const isEdit = event !== undefined;
  const isLocked = event?.status === "published";

  function close() {
    onOpenChange(false);
  }

  const create = useServerFormAction({
    action: createEvent,
    successMessage: "Event created",
    onSuccess: close,
  });
  const update = useServerFormAction({
    action: updateEvent,
    successMessage: "Event updated",
    onSuccess: close,
  });
  const active = isEdit ? update : create;

  async function handleSubmit(formData: FormData) {
    const isOrgWide = formData.get("isOrgWide") === "on";
    const groupIds = isOrgWide ? [] : formData.getAll("groupIds").map(String);
    const shared = {
      description: text(formData, "description"),
      location: text(formData, "location"),
      endsAtLocal: text(formData, "endsAt"),
    };

    if (!event) {
      await create.submit({
        orgId,
        title: text(formData, "title"),
        description: shared.description || undefined,
        location: shared.location || undefined,
        startsAtLocal: text(formData, "startsAt"),
        endsAtLocal: shared.endsAtLocal || undefined,
        isOrgWide,
        groupIds,
      });
      return;
    }
    if (isLocked) {
      await update.submit({ orgId, eventId: event.id, ...shared });
      return;
    }
    await update.submit({
      orgId,
      eventId: event.id,
      ...shared,
      title: text(formData, "title"),
      startsAtLocal: text(formData, "startsAt"),
      isOrgWide,
      groupIds,
    });
  }

  return (
    <FormDrawer
      description={
        isEdit
          ? "Changes are visible to families as soon as they are saved."
          : "New events start as a draft. Publish them when the details are final."
      }
      error={active.error}
      isBusy={active.isBusy}
      onOpenChange={onOpenChange}
      onSubmit={handleSubmit}
      open={open}
      submitLabel={isEdit ? "Save changes" : "Create draft"}
      title={isEdit ? "Edit event" : "New event"}
    >
      {/* 抽屉关闭时 Portal 卸载 children，这里的 state 与非受控输入一起天然重置 */}
      <EventFormFields event={event} groups={groups} isLocked={isLocked} timezone={timezone} />
    </FormDrawer>
  );
}

function EventFormFields({
  event,
  groups,
  isLocked,
  timezone,
}: {
  event?: EventFormValues;
  groups: EventFormGroup[];
  isLocked: boolean;
  timezone: string;
}): React.ReactElement {
  // 纯展示状态：控制 group 复选框是否可用；提交时的真值仍从 FormData 读
  const [isOrgWide, setIsOrgWide] = useState(event?.isOrgWide ?? false);

  return (
    <Frame>
      <FramePanel>
        <FrameHeader className="px-0 pt-0">
          <FrameTitle>Basics</FrameTitle>
        </FrameHeader>
        <Field>
          <FieldLabel htmlFor="event-title">Title</FieldLabel>
          <Input
            defaultValue={event?.title}
            disabled={isLocked}
            id="event-title"
            name="title"
            placeholder="Summer concert"
            required={!isLocked}
          />
          {isLocked && (
            <FieldDescription>
              Locked after publishing. Cancel the event and create a new one instead.
            </FieldDescription>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor="event-location">Location</FieldLabel>
          <Input
            defaultValue={event?.location ?? ""}
            id="event-location"
            name="location"
            placeholder="School hall"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="event-description">Description</FieldLabel>
          <Textarea
            defaultValue={event?.description ?? ""}
            id="event-description"
            name="description"
            rows={4}
          />
        </Field>
      </FramePanel>

      <FramePanel>
        <FrameHeader className="px-0 pt-0">
          <FrameTitle>Schedule</FrameTitle>
        </FrameHeader>
        <Field>
          <FieldLabel htmlFor="event-starts">Starts</FieldLabel>
          <Input
            defaultValue={event ? utcMsToLocalDateTime(event.startsAtUtc, timezone) : undefined}
            disabled={isLocked}
            id="event-starts"
            name="startsAt"
            required={!isLocked}
            type="datetime-local"
          />
          <FieldDescription>Entered in the organization time zone ({timezone}).</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="event-ends">Ends</FieldLabel>
          <Input
            defaultValue={
              event?.endsAtUtc ? utcMsToLocalDateTime(event.endsAtUtc, timezone) : undefined
            }
            id="event-ends"
            name="endsAt"
            type="datetime-local"
          />
          <FieldDescription>Optional.</FieldDescription>
        </Field>
      </FramePanel>

      <FramePanel>
        <FrameHeader className="px-0 pt-0">
          <FrameTitle>Audience</FrameTitle>
        </FrameHeader>
        {/* FieldDescription 依赖 Field.Root 的 context，整块受众必须包在同一个 Field 里 */}
        <Field>
          <label
            className="flex items-center gap-2 text-foreground text-sm"
            htmlFor="event-org-wide"
          >
            <Checkbox
              defaultChecked={event?.isOrgWide ?? false}
              disabled={isLocked}
              id="event-org-wide"
              name="isOrgWide"
              onCheckedChange={setIsOrgWide}
            />
            Whole organization
          </label>
          {groups.length === 0 ? (
            <FieldDescription>
              No groups yet. Create one first, or make the event organization-wide.
            </FieldDescription>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-3">
              {groups.map((group) => (
                <label
                  className="flex items-center gap-2 text-foreground text-sm"
                  htmlFor={`event-group-${group.id}`}
                  key={group.id}
                >
                  <Checkbox
                    defaultChecked={event?.groupIds.includes(group.id) ?? false}
                    disabled={isOrgWide || isLocked}
                    id={`event-group-${group.id}`}
                    name="groupIds"
                    value={group.id}
                  />
                  {group.name}
                </label>
              ))}
            </div>
          )}
          {isLocked && (
            <FieldDescription>Audience is fixed once the event is published.</FieldDescription>
          )}
        </Field>
      </FramePanel>
    </Frame>
  );
}
