import { describe, expect, it } from "vitest";
import { redirectPathSchema } from "../src/auth.ts";

// 防开放重定向：只允许站内绝对路径（issue #1 登录回跳）
describe("redirectPathSchema", () => {
  it("接受站内绝对路径", () => {
    expect(redirectPathSchema.safeParse("/new-org").success).toBe(true);
    expect(redirectPathSchema.safeParse("/o/org-123/events").success).toBe(true);
  });

  it("拒绝完整 URL", () => {
    expect(redirectPathSchema.safeParse("https://evil.com").success).toBe(false);
    expect(redirectPathSchema.safeParse("http://evil.com/x").success).toBe(false);
  });

  it("拒绝协议相对与反斜杠变体", () => {
    expect(redirectPathSchema.safeParse("//evil.com").success).toBe(false);
    expect(redirectPathSchema.safeParse("/\\evil.com").success).toBe(false);
  });

  it("拒绝相对路径与超长输入", () => {
    expect(redirectPathSchema.safeParse("new-org").success).toBe(false);
    expect(redirectPathSchema.safeParse(`/${"a".repeat(300)}`).success).toBe(false);
  });
});
