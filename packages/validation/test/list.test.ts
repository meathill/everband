import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createListQuerySchema, toOffset } from "../src/list.ts";

const schema = createListQuerySchema({
  sortFields: ["name", "createdAt"],
  defaultSort: "createdAt",
});

describe("createListQuerySchema", () => {
  it("空 search 走全套默认值", () => {
    expect(schema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
      sort: "createdAt",
      order: "desc",
      q: undefined,
    });
  });

  it("默认排序方向与每页条数可配置", () => {
    const custom = createListQuerySchema({
      sortFields: ["title"],
      defaultSort: "title",
      defaultOrder: "asc",
      defaultPageSize: 50,
    });
    expect(custom.parse({})).toMatchObject({ order: "asc", pageSize: 50, sort: "title" });
  });

  it("page 接受字符串数字，越界夹取到 1", () => {
    expect(schema.parse({ page: "3" }).page).toBe(3);
    expect(schema.parse({ page: "0" }).page).toBe(1);
    expect(schema.parse({ page: "-8" }).page).toBe(1);
  });

  it("page 非法值静默回落 1", () => {
    expect(schema.parse({ page: "abc" }).page).toBe(1);
    expect(schema.parse({ page: "1.5" }).page).toBe(1);
    expect(schema.parse({ page: null }).page).toBe(1);
  });

  it("pageSize 夹取到 10-100，非法值回落默认", () => {
    expect(schema.parse({ pageSize: "50" }).pageSize).toBe(50);
    expect(schema.parse({ pageSize: "5" }).pageSize).toBe(10);
    expect(schema.parse({ pageSize: "1000" }).pageSize).toBe(100);
    expect(schema.parse({ pageSize: "abc" }).pageSize).toBe(20);
  });

  it("空串参数视为未填写而不是 0", () => {
    expect(schema.parse({ page: "", pageSize: "" })).toMatchObject({ page: 1, pageSize: 20 });
  });

  it("sort/order 非法值回落默认", () => {
    expect(schema.parse({ sort: "name" }).sort).toBe("name");
    expect(schema.parse({ sort: "dropTable" }).sort).toBe("createdAt");
    expect(schema.parse({ order: "asc" }).order).toBe("asc");
    expect(schema.parse({ order: "sideways" }).order).toBe("desc");
  });

  it("q 去空白、空串归一为 undefined、超长回落 undefined", () => {
    expect(schema.parse({ q: "  bob  " }).q).toBe("bob");
    expect(schema.parse({ q: "" }).q).toBeUndefined();
    expect(schema.parse({ q: "   " }).q).toBeUndefined();
    expect(schema.parse({ q: "a".repeat(101) }).q).toBeUndefined();
    expect(schema.parse({ q: 42 }).q).toBeUndefined();
  });

  it("永不抛错：整串垃圾参数也能解析出可用结果", () => {
    expect(schema.parse({ page: {}, pageSize: [], sort: 1, order: false, q: {} })).toEqual({
      page: 1,
      pageSize: 20,
      sort: "createdAt",
      order: "desc",
      q: undefined,
    });
  });

  it("extend 追加筛选字段后与基础字段共存", () => {
    const extended = schema.extend({
      status: z.enum(["active", "left"]).catch("active"),
    });
    const parsed = extended.parse({ status: "left", page: "2", q: "kim" });
    expect(parsed).toEqual({
      page: 2,
      pageSize: 20,
      sort: "createdAt",
      order: "desc",
      q: "kim",
      status: "left",
    });
    expect(extended.parse({ status: "zzz" }).status).toBe("active");
  });

  // 编译期契约：输入侧所有键必须可选，否则 <Link to="/o/$orgId/members"> 这种
  // 不带 search 的跳转会被 validateSearch 的类型拒绝（靠 .default() 保证）
  it("输入侧所有键可选", () => {
    const noSearch: z.input<typeof schema> = {};
    const onlyPage: z.input<typeof schema> = { page: 2 };
    expect(schema.parse(noSearch).page).toBe(1);
    expect(schema.parse(onlyPage).page).toBe(2);
  });

  it("推导出的类型可用于赋值（编译期契约）", () => {
    const parsed: z.infer<typeof schema> = schema.parse({ sort: "name" });
    const sort: "name" | "createdAt" = parsed.sort;
    const order: "asc" | "desc" = parsed.order;
    expect([sort, order]).toEqual(["name", "desc"]);
  });
});

describe("toOffset", () => {
  it("按页码换算偏移", () => {
    expect(toOffset(1, 20)).toBe(0);
    expect(toOffset(3, 20)).toBe(40);
  });

  it("页码小于 1 时归零", () => {
    expect(toOffset(0, 20)).toBe(0);
    expect(toOffset(-3, 20)).toBe(0);
  });
});
