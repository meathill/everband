import { env } from "cloudflare:test";
import {
  activateInvitedMembership,
  consumeTokenByHash,
  ensureUser,
  findActiveMembership,
  verifyOtpCore,
} from "@everband/core";
import { createDb, schema } from "@everband/db";
import {
  generateId,
  ID_PREFIXES,
  isLoginRateLimited,
  MAX_LOGIN_REQUESTS_PER_EMAIL,
  MAX_LOGIN_REQUESTS_PER_IP,
  MAX_OTP_ATTEMPTS,
  sha256Hex,
} from "@everband/domain";
import { beforeEach, describe, expect, it } from "vitest";

const db = createDb(env.DB);
const NOW = 1_754_000_000_000;

let seq = 0;
function uniqueEmail(): string {
  seq += 1;
  return `user-${NOW}-${seq}-${Math.random().toString(36).slice(2, 8)}@test.local`;
}

async function insertLoginToken(email: string, token: string, otp: string, expiresAt: number) {
  const id = generateId(ID_PREFIXES.authToken);
  await db.insert(schema.authTokens).values({
    id,
    email,
    tokenHash: await sha256Hex(token),
    otpHash: await sha256Hex(otp),
    purpose: "login",
    expiresAt,
    createdAt: NOW,
  });
  return id;
}

describe("consumeTokenByHash（一次性使用）", () => {
  it("有效 token 只能消费一次", async () => {
    const email = uniqueEmail();
    await insertLoginToken(email, "token-once", "111111", NOW + 60_000);
    const hash = await sha256Hex("token-once");

    const first = await consumeTokenByHash(db, hash, NOW);
    expect(first?.email).toBe(email);

    const second = await consumeTokenByHash(db, hash, NOW + 1);
    expect(second).toBeNull();
  });

  it("过期 token 拒绝消费", async () => {
    const email = uniqueEmail();
    await insertLoginToken(email, "token-expired", "111111", NOW - 1);
    const result = await consumeTokenByHash(db, await sha256Hex("token-expired"), NOW);
    expect(result).toBeNull();
  });
});

describe("verifyOtpCore（尝试计数与消费）", () => {
  beforeEach(() => {
    seq += 100;
  });

  it("正确 OTP 验证通过且不可复用", async () => {
    const email = uniqueEmail();
    await insertLoginToken(email, `t-${email}`, "222333", NOW + 60_000);

    const first = await verifyOtpCore(db, email, "222333", NOW);
    expect(first?.email).toBe(email);

    // 已消费：同 OTP 再验失败
    const second = await verifyOtpCore(db, email, "222333", NOW + 1);
    expect(second).toBeNull();
  });

  it("错误 OTP 累计到上限后即使正确也拒绝", async () => {
    const email = uniqueEmail();
    await insertLoginToken(email, `t-${email}`, "444555", NOW + 60_000);

    for (let i = 0; i < MAX_OTP_ATTEMPTS; i++) {
      expect(await verifyOtpCore(db, email, "000000", NOW)).toBeNull();
    }
    // 第 6 次用正确 OTP：attempt 上限已满，原子条件拒绝
    expect(await verifyOtpCore(db, email, "444555", NOW)).toBeNull();
  });
});

describe("租户隔离（findActiveMembership）", () => {
  async function seedOrgWithOwner(): Promise<{ orgId: string; userId: string }> {
    const orgId = generateId(ID_PREFIXES.organization);
    const email = uniqueEmail();
    const userId = await ensureUser(db, email, NOW);
    await db.insert(schema.organizations).values({
      id: orgId,
      name: `Org ${orgId}`,
      type: "band",
      timezone: "Australia/Sydney",
      createdAt: NOW,
    });
    await db.insert(schema.memberships).values({
      id: generateId(ID_PREFIXES.membership),
      organizationId: orgId,
      userId,
      role: "owner",
      status: "active",
      invitedEmail: email,
      acceptedAt: NOW,
      createdAt: NOW,
    });
    return { orgId, userId };
  }

  it("成员只能命中自己的组织，跨组织探测返回 null", async () => {
    const a = await seedOrgWithOwner();
    const b = await seedOrgWithOwner();

    expect(await findActiveMembership(db, a.orgId, a.userId)).not.toBeNull();
    expect(await findActiveMembership(db, b.orgId, b.userId)).not.toBeNull();
    // 关键断言：A 的用户在 B 的组织没有权限，反之亦然
    expect(await findActiveMembership(db, b.orgId, a.userId)).toBeNull();
    expect(await findActiveMembership(db, a.orgId, b.userId)).toBeNull();
  });

  it("非 active 状态的 membership 不生效", async () => {
    const { orgId, userId } = await seedOrgWithOwner();
    const email = uniqueEmail();
    const invitedUserId = await ensureUser(db, email, NOW);
    const membershipId = generateId(ID_PREFIXES.membership);
    await db.insert(schema.memberships).values({
      id: membershipId,
      organizationId: orgId,
      userId: invitedUserId,
      role: "staff",
      status: "invited",
      invitedEmail: email,
      createdAt: NOW,
    });
    expect(await findActiveMembership(db, orgId, invitedUserId)).toBeNull();
    expect(await findActiveMembership(db, orgId, userId)).not.toBeNull();
  });

  it("激活邀请幂等：第二次激活返回 null 不重复生效", async () => {
    const { orgId } = await seedOrgWithOwner();
    const email = uniqueEmail();
    const userId = await ensureUser(db, email, NOW);
    const membershipId = generateId(ID_PREFIXES.membership);
    await db.insert(schema.memberships).values({
      id: membershipId,
      organizationId: orgId,
      role: "staff",
      status: "invited",
      invitedEmail: email,
      createdAt: NOW,
    });

    expect(await activateInvitedMembership(db, membershipId, userId, NOW)).toBe(orgId);
    expect(await activateInvitedMembership(db, membershipId, userId, NOW)).toBeNull();
    expect(await findActiveMembership(db, orgId, userId)).not.toBeNull();
  });
});

describe("isLoginRateLimited（登录请求限流边界）", () => {
  it("未达任一维度上限时放行", () => {
    expect(
      isLoginRateLimited(MAX_LOGIN_REQUESTS_PER_EMAIL - 1, MAX_LOGIN_REQUESTS_PER_IP - 1),
    ).toBe(false);
  });

  it("email 维度达到上限即拒绝", () => {
    expect(isLoginRateLimited(MAX_LOGIN_REQUESTS_PER_EMAIL, 0)).toBe(true);
  });

  it("IP 维度达到上限即拒绝", () => {
    expect(isLoginRateLimited(0, MAX_LOGIN_REQUESTS_PER_IP)).toBe(true);
  });
});
