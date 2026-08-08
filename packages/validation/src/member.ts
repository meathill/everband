import { z } from "zod";
import { emailSchema } from "./email.ts";

export const RELATIONSHIPS = ["parent", "guardian", "emergency"] as const;
export const STUDENT_STATUS_VALUES = ["interested", "active", "withdrawn", "archived"] as const;

export const contactInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: emailSchema,
  phone: z.string().trim().max(30).optional(),
  relationship: z.enum(RELATIONSHIPS),
});

export const createStudentSchema = z.object({
  orgId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  status: z.enum(STUDENT_STATUS_VALUES).default("active"),
  groupId: z.string().min(1).optional(),
  // 归并规则：邮箱已存在则复用该联系人及其 household；否则新建
  contact: contactInputSchema,
});

export const updateStudentStatusSchema = z.object({
  orgId: z.string().min(1),
  studentId: z.string().min(1),
  status: z.enum(STUDENT_STATUS_VALUES),
  groupId: z.string().min(1).optional(),
});

export const addStudentContactSchema = z.object({
  orgId: z.string().min(1),
  studentId: z.string().min(1),
  contact: contactInputSchema,
});

export const inviteParentSchema = z.object({
  orgId: z.string().min(1),
  contactId: z.string().min(1),
});

export const createGroupSchema = z.object({
  orgId: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).optional(),
});

const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const createTermSchema = z
  .object({
    orgId: z.string().min(1),
    name: z.string().trim().min(1).max(60),
    startDate: localDateSchema,
    endDate: localDateSchema,
  })
  .refine((value) => value.startDate <= value.endDate, {
    message: "Start date must be before end date",
    path: ["endDate"],
  });

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type ContactInput = z.infer<typeof contactInputSchema>;
