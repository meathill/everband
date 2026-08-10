import { describe, expect, it } from "vitest";
import {
  formatOrgDateTime,
  formatOrgTime,
  toLocalDateString,
  upcomingWindow,
} from "../src/time.ts";

// 悉尼时区：AEST=UTC+10，AEDT=UTC+11（10 月第一个周日 → 4 月第一个周日）

describe("upcomingWindow（组织时区）", () => {
  it("窗口终点是组织时区 30 天后的当日末尾", () => {
    // 2026-08-08T00:00:00Z = 悉尼 2026-08-08 10:00 (AEST)
    const now = Date.parse("2026-08-08T00:00:00Z");
    const window = upcomingWindow(now, "Australia/Sydney");
    expect(window.startUtcMs).toBe(now);
    // 30 天后 = 悉尼 2026-09-07 23:59:59.999 (AEST, UTC+10) = 09-07T13:59:59.999Z
    expect(new Date(window.endUtcMs).toISOString()).toBe("2026-09-07T13:59:59.999Z");
  });

  it("跨 AEDT 切换（10 月第一个周日）窗口终点用夏令时偏移", () => {
    // 2026-09-20 悉尼 AEST；30 天后 2026-10-20 已是 AEDT (UTC+11)
    const now = Date.parse("2026-09-20T00:00:00Z");
    const window = upcomingWindow(now, "Australia/Sydney");
    // 悉尼 2026-10-20 23:59:59.999 AEDT = 10-20T12:59:59.999Z
    expect(new Date(window.endUtcMs).toISOString()).toBe("2026-10-20T12:59:59.999Z");
  });

  it("时区差异导致不同的窗口边界", () => {
    const now = Date.parse("2026-08-08T00:00:00Z");
    const sydney = upcomingWindow(now, "Australia/Sydney");
    const perth = upcomingWindow(now, "Australia/Perth");
    // 珀斯 UTC+8，比悉尼晚 2 小时到达当日末尾
    expect(perth.endUtcMs - sydney.endUtcMs).toBe(2 * 60 * 60 * 1000);
  });
});

describe("toLocalDateString", () => {
  it("UTC 深夜在悉尼已是次日", () => {
    // 2026-08-08T15:00:00Z = 悉尼 2026-08-09 01:00
    expect(toLocalDateString(Date.parse("2026-08-08T15:00:00Z"), "Australia/Sydney")).toBe(
      "2026-08-09",
    );
    expect(toLocalDateString(Date.parse("2026-08-08T15:00:00Z"), "UTC")).toBe("2026-08-08");
  });
});

describe("formatOrgDateTime / formatOrgTime（显示端组织时区）", () => {
  it("按组织时区格式化，不受运行环境本地时区影响", () => {
    // 2026-08-15T08:00:00Z = 悉尼 2026-08-15 18:00 (AEST)
    const utcMs = Date.parse("2026-08-15T08:00:00Z");
    expect(formatOrgDateTime(utcMs, "Australia/Sydney")).toBe("8/15/2026, 6:00 PM");
    expect(formatOrgTime(utcMs, "Australia/Sydney")).toBe("6:00 PM");
    // 同一时刻在 UTC 显示不同
    expect(formatOrgDateTime(utcMs, "UTC")).toBe("8/15/2026, 8:00 AM");
  });

  it("跨 AEDT（夏令时）仍正确", () => {
    // 2026-10-07T07:00:00Z = 悉尼 2026-10-07 18:00 (AEDT, UTC+11)
    const utcMs = Date.parse("2026-10-07T07:00:00Z");
    expect(formatOrgDateTime(utcMs, "Australia/Sydney")).toBe("10/7/2026, 6:00 PM");
  });
});
