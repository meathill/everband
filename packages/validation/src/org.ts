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

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: z.enum(ORGANIZATION_TYPES),
  timezone: timezoneSchema,
  contactEmail: emailSchema.optional(),
});

export const orgIdSchema = z.object({
  orgId: z.string().min(1),
});

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
