import { describe, expect, it } from "vitest";
import { emailSchema, normalizeEmail } from "../src/email.ts";

describe("normalizeEmail", () => {
  it("小写并去首尾空白", () => {
    expect(normalizeEmail("  Alice@Example.COM ")).toBe("alice@example.com");
  });
});

describe("emailSchema", () => {
  it("接受合法邮箱并规范化", () => {
    expect(emailSchema.parse(" Bob@Test.org")).toBe("bob@test.org");
  });

  it("拒绝非法邮箱", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });
});
