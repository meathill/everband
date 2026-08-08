// 排练展开与 helper 轮换（PRD §5.4）。
// 日期展开是纯日期运算（YYYY-MM-DD 字符串）；
// 具体时刻的 UTC 换算走 time.ts 的 localDateTimeToUtcMs（DST 安全）。

export const SWAP_STATUSES = ["requested", "approved", "declined", "cancelled"] as const;
export type SwapStatus = (typeof SWAP_STATUSES)[number];

const SWAP_TRANSITIONS: Record<SwapStatus, readonly SwapStatus[]> = {
  requested: ["approved", "declined", "cancelled"],
  approved: [],
  declined: [],
  cancelled: [],
};

export function canTransitionSwap(from: SwapStatus, to: SwapStatus): boolean {
  return SWAP_TRANSITIONS[from].includes(to);
}

function parseDate(value: string): Date {
  // 以 UTC 正午锚定，避免任何时区/DST 影响日期加减
  return new Date(`${value}T12:00:00Z`);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// term 范围内某 weekday（0=周日…6=周六）的全部本地日期，升序
export function expandWeeklyDates(termStart: string, termEnd: string, weekday: number): string[] {
  const start = parseDate(termStart);
  const end = parseDate(termEnd);
  if (start.getTime() > end.getTime()) {
    return [];
  }
  const first = new Date(start);
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  first.setUTCDate(first.getUTCDate() + offset);

  const dates: string[] = [];
  for (
    const cursor = new Date(first);
    cursor.getTime() <= end.getTime();
    cursor.setUTCDate(cursor.getUTCDate() + 7)
  ) {
    dates.push(formatDate(cursor));
  }
  return dates;
}

// 可预测轮换：household 按 id 排序后轮转分配。
// 同一输入永远产生同一 roster（PRD：可预测、可解释）。
export function rotateHouseholds(
  sortedHouseholdIds: readonly string[],
  occurrenceIndex: number,
  helpersNeeded: number,
): string[] {
  if (sortedHouseholdIds.length === 0 || helpersNeeded <= 0) {
    return [];
  }
  const result: string[] = [];
  const count = Math.min(helpersNeeded, sortedHouseholdIds.length);
  for (let j = 0; j < count; j++) {
    const index = (occurrenceIndex * helpersNeeded + j) % sortedHouseholdIds.length;
    const id = sortedHouseholdIds[index];
    if (id !== undefined && !result.includes(id)) {
      result.push(id);
    }
  }
  return result;
}
