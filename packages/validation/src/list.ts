import { z } from "zod";

// 列表页 URL 查询参数的统一定义。
// URL 是用户可随手改的输入，任何非法值都不应该让路由报错——所以每个字段都用 .catch()
// 静默回落到默认值（与 auth.ts 的 redirectPathSchema 在 validateSearch 里的用法同源）。

export const SORT_ORDERS = ["asc", "desc"] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export const DEFAULT_PAGE_SIZE = 20;
export const MIN_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;
export const MAX_LIST_QUERY_LENGTH = 100;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// URL 参数只可能是字符串。先卡住"空串 / 非标量"再转数字——否则 Number("") === 0、
// Number([]) === 0 会让 ?page= 这类空参数被当成 0 而不是"没填"。
const searchInteger = z
  .union([z.number(), z.string().trim().min(1)])
  .transform(Number)
  .pipe(z.number().int());

export type ListQueryOptions<S extends readonly [string, ...string[]]> = {
  /** 允许排序的字段名，同时也是 DataTable 列的 key */
  sortFields: S;
  defaultSort: S[number];
  defaultOrder?: SortOrder;
  defaultPageSize?: number;
};

/**
 * 生成列表页的 search schema。返回值是普通 ZodObject，调用方可继续 .extend() 追加筛选字段。
 * 语义：page/pageSize 越界时夹取到合法区间，完全非法（非数字、非整数）时回落默认值。
 */
export function createListQuerySchema<const S extends readonly [string, ...string[]]>({
  sortFields,
  defaultSort,
  defaultOrder = "desc",
  defaultPageSize = DEFAULT_PAGE_SIZE,
}: ListQueryOptions<S>) {
  return z.object({
    // 每个字段都是 .default(...).catch(...)：default 让 **输入侧** 的键可选（否则
    // <Link to="/o/$orgId/members"> 这种不带 search 的跳转会被 validateSearch 的类型拒绝），
    // catch 让非法值静默回落。两者缺一不可。
    page: searchInteger
      .transform((value) => Math.max(1, value))
      .default(1)
      .catch(1),
    pageSize: searchInteger
      .transform((value) => clamp(value, MIN_PAGE_SIZE, MAX_PAGE_SIZE))
      .default(defaultPageSize)
      .catch(defaultPageSize),
    sort: z.enum(sortFields).default(defaultSort).catch(defaultSort),
    order: z.enum(SORT_ORDERS).default(defaultOrder).catch(defaultOrder),
    // 空串归一成 undefined，避免 URL 里留下 ?q= 这种噪音，也让下游少判一次分支
    q: z
      .string()
      .trim()
      .max(MAX_LIST_QUERY_LENGTH)
      .transform((value) => (value.length > 0 ? value : undefined))
      .optional()
      .catch(undefined),
  });
}

/** 分页查询的统一返回结构，db 层与页面 loader 共用 */
export type ListResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export function toOffset(page: number, pageSize: number): number {
  return Math.max(0, page - 1) * pageSize;
}
