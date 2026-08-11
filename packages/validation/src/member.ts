import { z } from "zod";
import { emailSchema } from "./email.ts";
import { createListQuerySchema } from "./list.ts";

export const RELATIONSHIPS = ["parent", "guardian", "emergency"] as const;
export const STUDENT_STATUS_VALUES = ["interested", "active", "withdrawn", "archived"] as const;
export const GROUP_STATUS_VALUES = ["active", "archived"] as const;
export type GroupStatus = (typeof GROUP_STATUS_VALUES)[number];

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

// 改名 / 换组。groupId: null = 移出分组，undefined = 不改（与 updateEventSchema 同源约定）。
// 状态变更仍走 updateStudentStatusSchema，两条路径互不覆盖。
export const updateStudentSchema = z.object({
  orgId: z.string().min(1),
  studentId: z.string().min(1),
  name: z.string().trim().min(1).max(80).optional(),
  groupId: z.string().min(1).nullable().optional(),
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

export const updateGroupSchema = z.object({
  orgId: z.string().min(1),
  groupId: z.string().min(1),
  name: z.string().trim().min(1).max(60).optional(),
  status: z.enum(GROUP_STATUS_VALUES).optional(),
});

export const GROUP_STATUS_FILTERS = ["active", "archived", "all"] as const;
export type GroupStatusFilter = (typeof GROUP_STATUS_FILTERS)[number];

// 分组选择器（成员/活动受众）只该看到 active，所以默认值就是 active；
// 管理页显式传 archived / all。
export const listGroupsSchema = z.object({
  orgId: z.string().min(1),
  status: z.enum(GROUP_STATUS_FILTERS).default("active").catch("active"),
});

// 分组管理页的 URL 参数。分组数量很少，不做分页与搜索，只留一个状态开关。
export const groupsListSchema = z.object({
  status: z.enum(GROUP_STATUS_FILTERS).default("active").catch("active"),
});

export const STUDENT_STATUS_FILTERS = ["all", ...STUDENT_STATUS_VALUES] as const;
export type StudentStatusFilter = (typeof STUDENT_STATUS_FILTERS)[number];

/**
 * staff 成员列表的 URL 查询参数。
 *
 * 归档语义：`status="all"` 表示"所有在册学生"，**不含 archived**——archived 是历史记录，
 * 默认视图不该被它稀释；要看归档必须显式选 `status="archived"`（落实在 listStudentsCore）。
 * `group` 是 groupId 或 "all"。extend 出来的字段同样 .default().catch()。
 */
export const studentsListSchema = createListQuerySchema({
  sortFields: ["name", "createdAt", "status"],
  defaultSort: "name",
  defaultOrder: "asc",
  defaultPageSize: 25,
}).extend({
  status: z.enum(STUDENT_STATUS_FILTERS).default("all").catch("all"),
  group: z.string().trim().min(1).max(64).default("all").catch("all"),
});

export type StudentsListQuery = z.output<typeof studentsListSchema>;

export const studentsPageSchema = studentsListSchema.extend({ orgId: z.string().min(1) });

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
