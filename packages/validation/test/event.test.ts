import { describe, expect, it } from "vitest";
import { createEventSchema, updateEventSchema } from "../src/event.ts";

describe("createEventSchema（date-only 与 datetime 并存）", () => {
  const base = {
    orgId: "org_1",
    title: "Rehearsal",
    isOrgWide: true,
    groupIds: [],
  };

  it("接受 datetime-local", () => {
    const parsed = createEventSchema.safeParse({
      ...base,
      startsAtLocal: "2026-09-10T18:00",
    });
    expect(parsed.success).toBe(true);
  });

  it("接受 date-only（时间待定）", () => {
    const parsed = createEventSchema.safeParse({ ...base, startsAtLocal: "2026-09-10" });
    expect(parsed.success).toBe(true);
  });

  it("拒绝非法格式", () => {
    const parsed = createEventSchema.safeParse({ ...base, startsAtLocal: "2026/09/10" });
    expect(parsed.success).toBe(false);
  });
});

describe("updateEventSchema（endsAtLocal 清空语义）", () => {
  it("空串表示清空，undefined 表示不改", () => {
    const cleared = updateEventSchema.safeParse({
      orgId: "org_1",
      eventId: "evt_1",
      endsAtLocal: "",
    });
    expect(cleared.success).toBe(true);
    const untouched = updateEventSchema.safeParse({ orgId: "org_1", eventId: "evt_1" });
    expect(untouched.success).toBe(true);
    expect("endsAtLocal" in (untouched.data ?? {})).toBe(false);
  });
});
