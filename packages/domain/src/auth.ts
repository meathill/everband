// 认证域纯函数：token/OTP 生成与校验规则（PRD §3.3/§8.4）。
// 存储侧只保存哈希；一次性使用与计数由 db 层原子 UPDATE 落实，
// 这里提供规则常量与无 I/O 的判断函数。

export const LOGIN_TOKEN_TTL_MS = 10 * 60 * 1000;
export const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const MAX_OTP_ATTEMPTS = 5;

// 登录请求限流：email 与 IP 双维度滑动窗口。
// IP 上限放宽到 30：NAT/学校网络下多个家长共享出口 IP 是常态，
// email 维度（3/10min）才是防骚扰主力。
export const LOGIN_REQUEST_WINDOW_MS = 10 * 60 * 1000;
export const MAX_LOGIN_REQUESTS_PER_EMAIL = 3;
export const MAX_LOGIN_REQUESTS_PER_IP = 30;

export function isLoginRateLimited(byEmail: number, byIp: number): boolean {
  return byEmail >= MAX_LOGIN_REQUESTS_PER_EMAIL || byIp >= MAX_LOGIN_REQUESTS_PER_IP;
}

const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function generateSecret(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) {
    out += BASE64URL[byte % 64];
  }
  return out;
}

export function generateOtp(): string {
  // 6 位数字，拒绝取模偏差：用 32 位随机数拒绝采样
  const max = 1_000_000;
  const limit = Math.floor(0xffffffff / max) * max;
  const buf = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buf);
    value = buf[0] as number;
  } while (value >= limit);
  return String(value % max).padStart(6, "0");
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function isExpired(expiresAt: number, now: number): boolean {
  return now >= expiresAt;
}

export function canAttemptOtp(attemptCount: number): boolean {
  return attemptCount < MAX_OTP_ATTEMPTS;
}

export type TokenPurpose = "login" | "invite";

export function tokenTtlMs(purpose: TokenPurpose): number {
  return purpose === "invite" ? INVITE_TOKEN_TTL_MS : LOGIN_TOKEN_TTL_MS;
}
