import { z } from "zod";
import { emailSchema } from "./email.ts";

export const ORGANIZATION_TYPES = ["band", "baseball", "football", "club", "other"] as const;

// IANA 时区合法性：交给 Intl 判定，避免维护时区清单
export const timezoneSchema = z.string().refine(
  (value) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  },
  { message: "Enter a valid IANA timezone, e.g. Australia/Sydney" },
);

/**
 * 时区下拉的候选值。
 *
 * 刻意不用 `Intl.supportedValuesOf("timeZone")`：它的返回值取决于运行时的 ICU 版本，
 * workerd（SSR）与浏览器（水合）两侧长度可能不同，会直接撞出 hydration mismatch；
 * 而且几百条 IANA 名字对用户毫无帮助。产品面向澳新社区团体，短表足够，
 * 组织当前时区若不在表内由页面单独补进去（见 settings 的时区选择器）。
 */
export const COMMON_TIMEZONES = [
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Brisbane",
  "Australia/Adelaide",
  "Australia/Perth",
  "Australia/Darwin",
  "Australia/Hobart",
  "Pacific/Auckland",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
] as const;

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: z.enum(ORGANIZATION_TYPES),
  timezone: timezoneSchema,
  contactEmail: emailSchema.optional(),
});

export const orgIdSchema = z.object({
  orgId: z.string().min(1),
});

const optionalContactEmailSchema = z
  .union([emailSchema, z.literal("")])
  .transform((value) => value || null)
  .optional();

// 只改传了的字段。type 暂不开放修改；contactEmail 是器材公开卡的联系入口。
export const updateOrganizationSchema = z.object({
  orgId: z.string().min(1),
  name: z.string().trim().min(2).max(80).optional(),
  timezone: timezoneSchema.optional(),
  contactEmail: optionalContactEmailSchema,
});

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export const inviteStaffSchema = z.object({
  orgId: z.string().min(1),
  email: emailSchema,
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type InviteStaffInput = z.infer<typeof inviteStaffSchema>;

// 公开主页（PRD §5.1 组织公开主页字段）
export const publicSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/, "Use 3-48 lowercase letters, numbers and hyphens");

export const updatePublicProfileSchema = z.object({
  orgId: z.string().min(1),
  enabled: z.boolean(),
  publicSlug: publicSlugSchema.optional(),
  publicDisplayName: z.string().trim().max(80).optional(),
  publicSummary: z.string().trim().max(200).optional(),
});

export const publicPageSchema = z.object({
  slug: publicSlugSchema,
});
