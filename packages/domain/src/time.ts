// 组织时区下的时间窗口计算（PRD §6.3：未来 30 天用组织时区）。
// 存储永远 UTC 毫秒；本地语义只在计算边界时出现。

import { TZDate } from "@date-fns/tz";
import { addDays, endOfDay } from "date-fns";

export const UPCOMING_WINDOW_DAYS = 30;

export interface TimeWindow {
  startUtcMs: number;
  endUtcMs: number;
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
