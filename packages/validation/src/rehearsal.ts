import { z } from "zod";

// 排练相关的 server fn 入参校验（PRD §5.4）。

const timeOfDaySchema = z.string().regex(/^\d{2}:\d{2}$/, "Use the time picker");

export const createRehearsalSeriesSchema = z.object({
  orgId: z.string().min(1),
  termId: z.string().min(1),
  // 缺省即全组织
  groupId: z.string().min(1).optional(),
  // 0=周日 … 6=周六
  weekday: z.number().int().min(0).max(6),
  startTimeLocal: timeOfDaySchema,
  endTimeLocal: timeOfDaySchema,
  location: z.string().trim().max(200).optional(),
  helpersNeeded: z.number().int().min(1).max(10),
});

// series 数量少（一个 term 通常个位数），不做分页/搜索，只留一个 group 筛选
export const listRehearsalSeriesSchema = z.object({
  orgId: z.string().min(1),
  groupId: z.string().min(1).optional(),
});

export const endRehearsalSeriesSchema = z.object({
  orgId: z.string().min(1),
  seriesId: z.string().min(1),
});

export const cancelOccurrenceSchema = z.object({
  orgId: z.string().min(1),
  occurrenceId: z.string().min(1),
});

export const requestSwapSchema = z.object({
  orgId: z.string().min(1),
  assignmentId: z.string().min(1),
  note: z.string().trim().max(500).optional(),
});

export const decideSwapSchema = z.object({
  orgId: z.string().min(1),
  swapId: z.string().min(1),
  decision: z.enum(["approved", "declined"]),
  replacementHouseholdId: z.string().min(1).optional(),
});

// 申请人自己撤回，不是 staff 审批，所以没有 decision 字段
export const cancelSwapRequestSchema = z.object({
  orgId: z.string().min(1),
  swapId: z.string().min(1),
});
