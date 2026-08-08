import { z } from "zod";

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
