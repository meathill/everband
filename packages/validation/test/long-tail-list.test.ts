import { describe, expect, it } from "vitest";
import { importJobsListSchema } from "../src/import.ts";
import { notificationsListSchema } from "../src/notification.ts";
import { updateTermSchema } from "../src/term.ts";

describe("长尾列表 search schema", () => {
  it("通知默认每页 20 条并容错未读筛选", () => {
    expect(notificationsListSchema.parse({})).toMatchObject({
      page: 1,
      pageSize: 20,
      filter: "all",
    });
    expect(notificationsListSchema.parse({ filter: "bad", page: "2" })).toMatchObject({
      page: 2,
      filter: "all",
    });
  });

  it("导入历史默认每页 10 条并夹取非法页码", () => {
    expect(importJobsListSchema.parse({})).toMatchObject({ page: 1, pageSize: 10 });
    expect(importJobsListSchema.parse({ page: "-4", pageSize: "500" })).toMatchObject({
      page: 1,
      pageSize: 100,
    });
  });
});

describe("学期编辑 schema", () => {
  it("日期必须成对修改且顺序正确", () => {
    const base = { orgId: "org_x", termId: "term_x" };
    expect(updateTermSchema.safeParse({ ...base, name: "Term 1" }).success).toBe(true);
    expect(updateTermSchema.safeParse({ ...base, startDate: "2026-01-01" }).success).toBe(false);
    expect(
      updateTermSchema.safeParse({
        ...base,
        startDate: "2026-03-01",
        endDate: "2026-02-01",
      }).success,
    ).toBe(false);
  });
});
