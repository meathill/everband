import {
  activateInvitedMembership,
  type ConsumedToken,
  consumeTokenByHash,
  ensureUser,
  linkContactsToUser,
  verifyOtpCore,
} from "@everband/core";
import { schema } from "@everband/db";
import {
  generateId,
  generateOtp,
  generateSecret,
  ID_PREFIXES,
  LOGIN_REQUEST_WINDOW_MS,
  MAX_LOGIN_REQUESTS_PER_EMAIL,
  MAX_LOGIN_REQUESTS_PER_IP,
  sha256Hex,
  tokenTtlMs,
} from "@everband/domain";
import { requestLoginSchema, verifyOtpSchema, verifyTokenSchema } from "@everband/validation";
import { createServerFn } from "@tanstack/react-start";
import { getRequestIP, getRequestUrl } from "@tanstack/react-start/server";
import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "./context.ts";
import { getEmailSender } from "./email.ts";
import { createSession, destroySession, getSessionUser } from "./session.ts";

// 统一的失败信息：不区分"邮箱不存在/代码错误/已过期"，避免枚举探测
const GENERIC_FAILURE = "That code or link is invalid or has expired. Request a new one.";

async function countRecentTokens(
  db: ReturnType<typeof getDb>,
  column: "email" | "requestIp",
  value: string,
  now: number,
): Promise<number> {
  const field = column === "email" ? schema.authTokens.email : schema.authTokens.requestIp;
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.authTokens)
    .where(and(eq(field, value), gt(schema.authTokens.createdAt, now - LOGIN_REQUEST_WINDOW_MS)));
  return rows[0]?.count ?? 0;
}

export const requestLoginCode = createServerFn({ method: "POST" })
  .validator(requestLoginSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const now = Date.now();
    const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";

    const [byEmail, byIp] = await Promise.all([
      countRecentTokens(db, "email", data.email, now),
      countRecentTokens(db, "requestIp", ip, now),
    ]);
    if (byEmail >= MAX_LOGIN_REQUESTS_PER_EMAIL || byIp >= MAX_LOGIN_REQUESTS_PER_IP) {
      return { ok: false as const, error: "Too many requests. Try again in a few minutes." };
    }

    const token = generateSecret(32);
    const otp = generateOtp();
    await db.insert(schema.authTokens).values({
      id: generateId(ID_PREFIXES.authToken),
      email: data.email,
      tokenHash: await sha256Hex(token),
      otpHash: await sha256Hex(otp),
      purpose: "login",
      expiresAt: now + tokenTtlMs("login"),
      requestIp: ip,
      createdAt: now,
    });

    const origin = getRequestUrl().origin;
    // redirect 已过 redirectPathSchema 校验（站内路径），登录后由 /verify 优先跳回
    const redirectSuffix = data.redirect ? `&redirect=${encodeURIComponent(data.redirect)}` : "";
    const link = `${origin}/verify?token=${token}${redirectSuffix}`;
    const sent = await getEmailSender(db).send({
      to: data.email,
      subject: `Your Everband sign-in code: ${otp}`,
      text: [
        `Your sign-in code is ${otp}. It expires in 10 minutes.`,
        "",
        `Or sign in directly with this link: ${link}`,
        "",
        "If you didn't request this, you can ignore this email.",
      ].join("\n"),
      kind: "magic-link",
    });
    if (!sent.ok) {
      console.error("magic link email failed", { error: sent.error });
      return {
        ok: false as const,
        error: "We couldn't send the email. Check the address and try again.",
      };
    }

    return { ok: true as const };
  });

// 登录成功后的共同路径：建用户、建 session、处理邀请激活
async function finishLogin(
  db: ReturnType<typeof getDb>,
  token: ConsumedToken,
  now: number,
): Promise<string> {
  const userId = await ensureUser(db, token.email, now);
  await createSession(db, userId);
  // parent/联系人：登录即把同邮箱的联系人档案关联到该用户
  await linkContactsToUser(db, token.email, userId);
  if (token.purpose === "invite" && token.membershipId) {
    const orgId = await activateInvitedMembership(db, token.membershipId, userId, now);
    if (orgId) {
      return `/o/${orgId}`;
    }
  }
  return "/select-org";
}

export const verifyLoginToken = createServerFn({ method: "POST" })
  .validator(verifyTokenSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const now = Date.now();
    const token = await consumeTokenByHash(db, await sha256Hex(data.token), now);
    if (!token) {
      return { ok: false as const, error: GENERIC_FAILURE };
    }
    return { ok: true as const, redirectTo: await finishLogin(db, token, now) };
  });

export const verifyLoginOtp = createServerFn({ method: "POST" })
  .validator(verifyOtpSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const now = Date.now();
    const token = await verifyOtpCore(db, data.email, data.otp, now);
    if (!token) {
      return { ok: false as const, error: GENERIC_FAILURE };
    }
    return { ok: true as const, redirectTo: await finishLogin(db, token, now) };
  });

export const getCurrentUser = createServerFn({ method: "GET" }).handler(async () => {
  return getSessionUser(getDb());
});

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  await destroySession(getDb());
  return { ok: true as const };
});
