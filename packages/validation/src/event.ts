import { z } from "zod";
import { createListQuerySchema } from "./list.ts";

const localDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Use the date and time picker");

export const createEventSchema = z
  .object({
    orgId: z.string().min(1),
    title: z.string().trim().min(1).max(120),
    type: z.string().trim().min(1).max(40).default("event"),
    description: z.string().trim().max(4000).optional(),
    // 组织时区下的本地时间，服务端转 UTC
    startsAtLocal: localDateTimeSchema,
    endsAtLocal: localDateTimeSchema.optional(),
    location: z.string().trim().max(200).optional(),
    isOrgWide: z.boolean(),
    groupIds: z.array(z.string().min(1)).max(50),
  })
  .refine((value) => value.isOrgWide || value.groupIds.length > 0, {
    message: "Pick at least one group, or make the event organization-wide",
    path: ["groupIds"],
  });

export const eventIdSchema = z.object({
  orgId: z.string().min(1),
  eventId: z.string().min(1),
});

// draft 阶段可改全部字段；published 只放开 description/location/endsAtLocal（见 core 的白名单）。
// 全部字段可选：调用方只提交表单里出现过的键，core 按状态再裁剪一次。
export const updateEventSchema = z
  .object({
    orgId: z.string().min(1),
    eventId: z.string().min(1),
    title: z.string().trim().min(1).max(120).optional(),
    // 空串表示"清空该可选字段"，与 undefined（不改）区分
    description: z.string().trim().max(4000).optional(),
    location: z.string().trim().max(200).optional(),
    startsAtLocal: localDateTimeSchema.optional(),
    endsAtLocal: localDateTimeSchema.or(z.literal("")).optional(),
    isOrgWide: z.boolean().optional(),
    groupIds: z.array(z.string().min(1)).max(50).optional(),
  })
  .refine((value) => value.isOrgWide !== false || (value.groupIds?.length ?? 0) > 0, {
    message: "Pick at least one group, or make the event organization-wide",
    path: ["groupIds"],
  });

export const deleteDraftEventSchema = eventIdSchema;

export const deleteEventUpdateSchema = z.object({
  orgId: z.string().min(1),
  updateId: z.string().min(1),
});

export const deleteAttachmentSchema = z.object({
  orgId: z.string().min(1),
  attachmentId: z.string().min(1),
});

export const EVENT_STATUS_FILTERS = [
  "all",
  "draft",
  "published",
  "cancelled",
  "completed",
] as const;
export type EventStatusFilter = (typeof EVENT_STATUS_FILTERS)[number];

export const EVENT_TIME_FILTERS = ["upcoming", "past", "all"] as const;
export type EventTimeFilter = (typeof EVENT_TIME_FILTERS)[number];

// staff 活动列表的 URL 查询参数。默认看未来活动，所以默认排序是 startsAtUtc asc
// （最近的排在最前）；看 past 时用户自己点表头切 desc。
// extend 出来的筛选字段同样 .default().catch()——default 让输入侧可省略，catch 让非法值静默回落。
export const eventsListSchema = createListQuerySchema({
  sortFields: ["startsAtUtc", "createdAt", "title"],
  defaultSort: "startsAtUtc",
  defaultOrder: "asc",
}).extend({
  status: z.enum(EVENT_STATUS_FILTERS).default("all").catch("all"),
  time: z.enum(EVENT_TIME_FILTERS).default("upcoming").catch("upcoming"),
});

export type EventsListQuery = z.output<typeof eventsListSchema>;

export const eventsPageSchema = eventsListSchema.extend({ orgId: z.string().min(1) });

export const transitionEventSchema = z.object({
  orgId: z.string().min(1),
  eventId: z.string().min(1),
  status: z.enum(["published", "cancelled", "completed"]),
});

export const createEventUpdateSchema = z.object({
  orgId: z.string().min(1),
  eventId: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(8000),
});

export const editEventUpdateSchema = z.object({
  orgId: z.string().min(1),
  updateId: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(8000),
});

export const publishEventUpdateSchema = z.object({
  orgId: z.string().min(1),
  updateId: z.string().min(1),
});

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export const uploadAttachmentSchema = z.object({
  orgId: z.string().min(1),
  eventId: z.string().min(1),
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(1).max(120),
  // base64 编码内容（≤5MB 原始大小）
  dataBase64: z
    .string()
    .min(1)
    .max(Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 100),
});
