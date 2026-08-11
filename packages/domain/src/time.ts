// 组织时区下的时间窗口计算（PRD §6.3：未来 30 天用组织时区）。
// 存储永远 UTC 毫秒；本地语义只在计算边界时出现。

import { TZDate } from "@date-fns/tz";
import { addDays, endOfDay } from "date-fns";

export const UPCOMING_WINDOW_DAYS = 30;

export interface TimeWindow {
  startUtcMs: number;
  endUtcMs: number;
}

export interface MonthWindow extends TimeWindow {
  month: string;
}

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

export function currentMonthInTimezone(nowUtcMs: number, timezone: string): string {
  const local = new TZDate(nowUtcMs, timezone);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}`;
}

/** 组织时区下月份的 UTC 半开区间 `[start, end)`，适合直接用于数据库范围查询。 */
export function monthWindow(month: string, timezone: string): MonthWindow {
  const match = MONTH_PATTERN.exec(month);
  if (!match) {
    throw new Error(`Invalid month value: ${month}`);
  }
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) {
    throw new Error(`Invalid month value: ${month}`);
  }
  const start = new TZDate(year, monthNumber - 1, 1, 0, 0, 0, 0, timezone);
  const end = new TZDate(year, monthNumber, 1, 0, 0, 0, 0, timezone);
  return { month, startUtcMs: start.getTime(), endUtcMs: end.getTime() };
}

// [现在, 组织时区下 30 天后的当日 23:59:59.999]
export function upcomingWindow(nowUtcMs: number, timezone: string): TimeWindow {
  const localNow = new TZDate(nowUtcMs, timezone);
  const localEnd = endOfDay(addDays(localNow, UPCOMING_WINDOW_DAYS));
  return { startUtcMs: nowUtcMs, endUtcMs: localEnd.getTime() };
}

// staff 在组织时区输入的 datetime-local（YYYY-MM-DDTHH:mm）→ UTC 毫秒
export function localDateTimeToUtcMs(local: string, timezone: string): number {
  const [datePart, timePart] = local.split("T");
  if (!datePart || !timePart) {
    throw new Error(`Invalid datetime-local value: ${local}`);
  }
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined
  ) {
    throw new Error(`Invalid datetime-local value: ${local}`);
  }
  return new TZDate(year, month - 1, day, hour, minute, 0, 0, timezone).getTime();
}

// UTC 毫秒 → 组织时区 datetime-local 值（编辑表单回显用）
export function utcMsToLocalDateTime(utcMs: number, timezone: string): string {
  const local = new TZDate(utcMs, timezone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`;
}

// 组织时区下的本地日期字符串（YYYY-MM-DD）
export function toLocalDateString(utcMs: number, timezone: string): string {
  const local = new TZDate(utcMs, timezone);
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, "0");
  const day = String(local.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// 组织时区下的展示格式化（en-US 风格，与既有 toLocaleString 输出对齐）。
// 显示端必须使用组织时区而非浏览器本地时区，否则 staff 看到的时间与输入不一致。
export function formatOrgDateTime(utcMs: number, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(utcMs);
}

// 组织时区下的时刻显示（仅时间，用于排练 occurrence 等已有本地日期的场景）
export function formatOrgTime(utcMs: number, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(utcMs);
}
