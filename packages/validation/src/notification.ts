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
