import { describe, expect, it } from "vitest";
import { getRouteAuthErrorCode } from "../src/lib/route-auth-error.ts";

describe("route auth error classification", () => {
  it("只把明确的鉴权错误识别为登录或组织访问问题", () => {
    expect(getRouteAuthErrorCode(new Error("unauthenticated"))).toBe("unauthenticated");
    expect(getRouteAuthErrorCode(new Error("forbidden"))).toBe("forbidden");
  });

  it("不把数据库和其他服务端异常伪装成登录失效", () => {
    expect(getRouteAuthErrorCode(new Error("D1_ERROR: no such table: ledger_entries"))).toBeNull();
    expect(getRouteAuthErrorCode("unauthenticated")).toBeNull();
  });
});
