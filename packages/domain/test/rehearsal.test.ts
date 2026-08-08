import { describe, expect, it } from "vitest";
import { canTransitionSwap, expandWeeklyDates, rotateHouseholds } from "../src/rehearsal.ts";
import { localDateTimeToUtcMs } from "../src/time.ts";

describe("expandWeeklyDates", () => {
  it("term 范围内的每周日期，含边界", () => {
    // 2026-10-05 是周一；取每周三（weekday=3）
    const dates = expandWeeklyDates("2026-10-05", "2026-11-04", 3);
    expect(dates).toEqual(["2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28", "2026-11-04"]);
  });

  it("term 起点即目标 weekday 时含当天", () => {
    const dates = expandWeeklyDates("2026-10-07", "2026-10-21", 3);
    expect(dates[0]).toBe("2026-10-07");
    expect(dates).toHaveLength(3);
  });

  it("term 为空或倒置返回空", () => {
    expect(expandWeeklyDates("2026-11-01", "2026-10-01", 3)).toEqual([]);
  });

  it("跨悉尼 AEDT 切换周（2026-10-04）本地时刻不漂移", () => {
    // 悉尼 2026 夏令时开始：10 月第一个周日（10-04）02:00 → 03:00
    const dates = expandWeeklyDates("2026-09-28", "2026-10-12", 3);
    expect(dates).toEqual(["2026-09-30", "2026-10-07"]);
    // 切换前 17:30 AEST = 07:30 UTC；切换后 17:30 AEDT = 06:30 UTC
    const before = localDateTimeToUtcMs("2026-09-30T17:30", "Australia/Sydney");
    const after = localDateTimeToUtcMs("2026-10-07T17:30", "Australia/Sydney");
    expect(new Date(before).toISOString()).toBe("2026-09-30T07:30:00.000Z");
    expect(new Date(after).toISOString()).toBe("2026-10-07T06:30:00.000Z");
  });
});

describe("rotateHouseholds", () => {
  const households = ["hh_a", "hh_b", "hh_c"];

  it("同输入同输出（可预测）", () => {
    expect(rotateHouseholds(households, 0, 1)).toEqual(rotateHouseholds(households, 0, 1));
  });

  it("单 helper 逐周轮转", () => {
    expect(rotateHouseholds(households, 0, 1)).toEqual(["hh_a"]);
    expect(rotateHouseholds(households, 1, 1)).toEqual(["hh_b"]);
    expect(rotateHouseholds(households, 2, 1)).toEqual(["hh_c"]);
    expect(rotateHouseholds(households, 3, 1)).toEqual(["hh_a"]);
  });

  it("多 helper 不重复且覆盖轮转", () => {
    expect(rotateHouseholds(households, 0, 2)).toEqual(["hh_a", "hh_b"]);
    expect(rotateHouseholds(households, 1, 2)).toEqual(["hh_c", "hh_a"]);
  });

  it("helper 数超过 household 数时不重复", () => {
    expect(rotateHouseholds(["hh_x"], 0, 3)).toEqual(["hh_x"]);
  });

  it("空输入返回空", () => {
    expect(rotateHouseholds([], 0, 2)).toEqual([]);
  });
});

describe("swap 状态机", () => {
  it("requested 可转三个终态，终态不可再转", () => {
    expect(canTransitionSwap("requested", "approved")).toBe(true);
    expect(canTransitionSwap("requested", "declined")).toBe(true);
    expect(canTransitionSwap("requested", "cancelled")).toBe(true);
    expect(canTransitionSwap("approved", "declined")).toBe(false);
    expect(canTransitionSwap("declined", "approved")).toBe(false);
  });
});
