import { z } from "zod";
import { createListQuerySchema } from "./list.ts";

// 站内通知收件箱的 URL 参数。
// 排序固定"最新在前"——通知没有第二种有意义的排法，所以 sortFields 只给一个字段，
// 页面也不渲染排序 UI；保留 sort/order 只是为了复用 createListQuerySchema 的分页语义。

export const NOTIFICATION_FILTERS = ["all", "unread"] as const;
export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number];

export const notificationsListSchema = createListQuerySchema({
  sortFields: ["createdAt"],
  defaultSort: "createdAt",
  defaultOrder: "desc",
  defaultPageSize: 20,
}).extend({
  filter: z.enum(NOTIFICATION_FILTERS).default("all").catch("all"),
});

export type NotificationsListQuery = z.output<typeof notificationsListSchema>;

export const notificationsPageSchema = notificationsListSchema.extend({
  orgId: z.string().min(1),
});

export const notificationIdSchema = z.object({
  orgId: z.string().min(1),
  notificationId: z.string().min(1),
});

// 群发写信页的 URL 参数：三种受众来源取并集，event 可叠加 RSVP 表单排除。
// 数组参数由 TanStack Router 序列化为 groups[]=a&groups[]=b。
// 无任何来源参数且未显式 compose/draft 时，页面显示"邮件中心"列表（草稿 + 发送历史）。
export const emailComposeSearchSchema = z.object({
  /** 显式进入写信视图（新建邮件，不带受众来源） */
  compose: z.boolean().optional(),
  /** 恢复指定草稿（列表视图点击草稿卡片进入） */
  draft: z.string().min(1).optional(),
  groups: z.array(z.string().min(1)).optional(),
  students: z.array(z.string().min(1)).optional(),
  event: z.string().min(1).optional(),
  excludeForm: z.boolean().optional(),
});

export type EmailComposeSearch = z.output<typeof emailComposeSearchSchema>;
