import { z } from "zod";
import { createListQuerySchema } from "./list.ts";

// 导入任务历史的 URL 参数。任务只按发起时间倒序看，没有搜索与筛选的场景，
// 所以只保留分页；每页 10 条（一屏内看得完，行本身很宽）。

export const importJobsListSchema = createListQuerySchema({
  sortFields: ["createdAt"],
  defaultSort: "createdAt",
  defaultOrder: "desc",
  defaultPageSize: 10,
});

export type ImportJobsListQuery = z.output<typeof importJobsListSchema>;

export const importJobsPageSchema = importJobsListSchema.extend({
  orgId: z.string().min(1),
});
