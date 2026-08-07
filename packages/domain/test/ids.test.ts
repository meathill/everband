import { describe, expect, it } from "vitest";
import { generateId, hasPrefix, ID_PREFIXES } from "../src/ids.ts";

describe("generateId", () => {
  it("生成带前缀的 ID", () => {
    const id = generateId(ID_PREFIXES.organization);
    expect(id).toMatch(/^org_[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("时间部分单调可排序", () => {
    const earlier = generateId(ID_PREFIXES.student, 1_000_000);
    const later = generateId(ID_PREFIXES.student, 2_000_000);
    expect(later > earlier).toBe(true);
  });

  it("同一毫秒内不重复", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateId(ID_PREFIXES.user, 42)));
    expect(ids.size).toBe(1000);
  });

  it("hasPrefix 精确匹配前缀", () => {
    const id = generateId(ID_PREFIXES.event);
    expect(hasPrefix(id, ID_PREFIXES.event)).toBe(true);
    expect(hasPrefix(id, ID_PREFIXES.eventUpdate)).toBe(false);
  });
});
