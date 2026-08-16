import type { EventStatus } from "@everband/domain";
import { utcMsToLocalDateTime } from "@everband/domain";
import { Checkbox } from "@everband/ui/components/checkbox";
import { DatePicker } from "@everband/ui/components/date-picker";
import { Field, FieldDescription, FieldLabel } from "@everband/ui/components/field";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@everband/ui/components/frame";
import { Input } from "@everband/ui/components/input";
import { Textarea } from "@everband/ui/components/textarea";
import type React from "react";
import { useState } from "react";
import { FormDrawer } from "~/components/form-drawer.tsx";
import { useServerFormAction } from "~/hooks/use-server-form-action.ts";
import { createEvent, updateEvent } from "~/server/events.ts";

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

export interface EventFormGroup {
  id: string;
  name: string;
}

export interface EventFormDrawerProps {
  orgId: string;
  /** 组织时区：datetime-local 的输入/回填都在这个时区下发生 */
  timezone: string;
  groups: EventFormGroup[];
  event?: EventFormValues;
  /** 创建模式下预填的开始时间（datetime-local 字符串，如 "2026-08-15T09:00"） */
  defaultStartsAtLocal?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 创建/编辑成功后的回调（如刷新依赖本地 state 的日历） */
  onSubmitted?: () => void;
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** "YYYY-MM-DDTHH:mm" → 拆成日期与时间两份默认值 */
function splitLocalDateTime(local: string | undefined): { date?: string; time?: string } {
  if (!local) {
    return {};
  }
  const [date, time] = local.split("T");
  return { date, time };
}

/** 拆分后的日期与时间字段组合回 "YYYY-MM-DDTHH:mm" */
function composeDateTime(formData: FormData, prefix: "startsAt" | "endsAt"): string {
  const date = text(formData, `${prefix}Date`);
  const time = text(formData, `${prefix}Time`);
  return date && time ? `${date}T${time}` : "";
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
  defaultStartsAtLocal,
  open,
  onOpenChange,
  onSubmitted,
}: EventFormDrawerProps): React.ReactElement {
  const isEdit = event !== undefined;
  const isLocked = event?.status === "published";

  function close() {
    onOpenChange(false);
  }

  function closeAndNotify() {
    close();
    onSubmitted?.();
  }

  const create = useServerFormAction({
    action: createEvent,
    successMessage: "Event created",
    onSuccess: closeAndNotify,
  });
  const update = useServerFormAction({
    action: updateEvent,
    successMessage: "Event updated",
    onSuccess: closeAndNotify,
  });
  const active = isEdit ? update : create;

  async function handleSubmit(formData: FormData) {
    const isOrgWide = formData.get("isOrgWide") === "on";
    const groupIds = isOrgWide ? [] : formData.getAll("groupIds").map(String);
    const shared = {
      description: text(formData, "description"),
      location: text(formData, "location"),
      endsAtLocal: composeDateTime(formData, "endsAt"),
    };

    if (!event) {
      await create.submit({
        orgId,
        title: text(formData, "title"),
        description: shared.description || undefined,
        location: shared.location || undefined,
        startsAtLocal: composeDateTime(formData, "startsAt"),
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
      startsAtLocal: composeDateTime(formData, "startsAt"),
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
      <EventFormFields
        defaultStartsAtLocal={defaultStartsAtLocal}
        event={event}
        groups={groups}
        isLocked={isLocked}
        timezone={timezone}
      />
    </FormDrawer>
  );
}

function EventFormFields({
  event,
  groups,
  isLocked,
  timezone,
  defaultStartsAtLocal,
}: {
  event?: EventFormValues;
  groups: EventFormGroup[];
  isLocked: boolean;
  timezone: string;
  defaultStartsAtLocal?: string;
}): React.ReactElement {
  // 纯展示状态：控制 group 复选框是否可用；提交时的真值仍从 FormData 读
  const [isOrgWide, setIsOrgWide] = useState(event?.isOrgWide ?? true);

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
        <div className="grid gap-2 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="event-starts-date">Starts date</FieldLabel>
            <DatePicker
              aria-label="Start date"
              defaultValue={
                splitLocalDateTime(
                  event ? utcMsToLocalDateTime(event.startsAtUtc, timezone) : defaultStartsAtLocal,
                ).date
              }
              disabled={isLocked}
              id="event-starts-date"
              name="startsAtDate"
              required={!isLocked}
            />
            <FieldDescription>Entered in the organization time zone ({timezone}).</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="event-starts-time">Starts time</FieldLabel>
            <Input
              defaultValue={
                splitLocalDateTime(
                  event ? utcMsToLocalDateTime(event.startsAtUtc, timezone) : defaultStartsAtLocal,
                ).time
              }
              disabled={isLocked}
              id="event-starts-time"
              name="startsAtTime"
              required={!isLocked}
              type="time"
            />
          </Field>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="event-ends-date">Ends date</FieldLabel>
            <DatePicker
              aria-label="End date"
              defaultValue={
                splitLocalDateTime(
                  event?.endsAtUtc ? utcMsToLocalDateTime(event.endsAtUtc, timezone) : undefined,
                ).date
              }
              id="event-ends-date"
              name="endsAtDate"
            />
            <FieldDescription>Optional.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="event-ends-time">Ends time</FieldLabel>
            <Input
              defaultValue={
                splitLocalDateTime(
                  event?.endsAtUtc ? utcMsToLocalDateTime(event.endsAtUtc, timezone) : undefined,
                ).time
              }
              id="event-ends-time"
              name="endsAtTime"
              type="time"
            />
          </Field>
        </div>
      </FramePanel>

      <FramePanel>
        <FrameHeader className="px-0 pt-0">
          <FrameTitle>Audience</FrameTitle>
        </FrameHeader>
        {/* base-ui Field 一个 Root 只支持一个 Control（registeredFieldName 会被后者覆盖，
            多个 checkbox 共享一个 Field 会把彼此的 name 串掉），所以这里用原生 label 组织 */}
        <label className="flex items-center gap-2 text-foreground text-sm" htmlFor="event-org-wide">
          <Checkbox
            defaultChecked={event?.isOrgWide ?? true}
            disabled={isLocked}
            id="event-org-wide"
            name="isOrgWide"
            onCheckedChange={setIsOrgWide}
          />
          Whole organization
        </label>
        {groups.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            No groups yet. Create one first, or make the event organization-wide.
          </p>
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
          <p className="text-muted-foreground text-xs">
            Audience is fixed once the event is published.
          </p>
        )}
      </FramePanel>
    </Frame>
  );
}
