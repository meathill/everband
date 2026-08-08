import { describe, expect, it } from "vitest";
import {
  canAttemptOtp,
  generateOtp,
  generateSecret,
  isExpired,
  LOGIN_TOKEN_TTL_MS,
  MAX_OTP_ATTEMPTS,
  sha256Hex,
  tokenTtlMs,
} from "../src/auth.ts";

describe("generateSecret", () => {
  it("默认 32 字符、base64url 字母表", () => {
    const secret = generateSecret();
    expect(secret).toMatch(/^[A-Za-z0-9\-_]{32}$/);
  });

  it("不重复", () => {
    const values = new Set(Array.from({ length: 100 }, () => generateSecret()));
    expect(values.size).toBe(100);
  });
});

describe("generateOtp", () => {
  it("恒为 6 位数字（含前导零）", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateOtp()).toMatch(/^\d{6}$/);
    }
  });
});

describe("sha256Hex", () => {
  it("与已知向量一致", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("过期与尝试次数", () => {
  it("到达 expiresAt 即过期", () => {
    expect(isExpired(1000, 999)).toBe(false);
    expect(isExpired(1000, 1000)).toBe(true);
  });

  it("OTP 尝试上限", () => {
    expect(canAttemptOtp(MAX_OTP_ATTEMPTS - 1)).toBe(true);
    expect(canAttemptOtp(MAX_OTP_ATTEMPTS)).toBe(false);
  });

  it("purpose 决定 TTL", () => {
    expect(tokenTtlMs("login")).toBe(LOGIN_TOKEN_TTL_MS);
    expect(tokenTtlMs("invite")).toBeGreaterThan(LOGIN_TOKEN_TTL_MS);
  });
});
