// 认证核心：只依赖 db 的可测函数（无 cookie/请求上下文）。
// server/auth.ts 的 server functions 是它们的薄封装；
// Worker 集成测试直接对这些函数跑真实 D1（miniflare）。

import type { Database } from "@everband/db";
import { schema } from "@everband/db";
import { generateId, ID_PREFIXES, MAX_OTP_ATTEMPTS, sha256Hex } from "@everband/domain";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";

export interface ConsumedToken {
  email: string;
  purpose: "login" | "invite";
  membershipId: string | null;
}

// 原子消费 magic link/invite token：一次性使用由
// UPDATE ... WHERE consumed_at IS NULL 保证，重复消费返回 null
export async function consumeTokenByHash(
  db: Database,
  tokenHash: string,
  now: number,
): Promise<ConsumedToken | null> {
  const consumed = await db
    .update(schema.authTokens)
    .set({ consumedAt: now })
    .where(
      and(
        eq(schema.authTokens.tokenHash, tokenHash),
        isNull(schema.authTokens.consumedAt),
        gt(schema.authTokens.expiresAt, now),
      ),
    )
    .returning({
      email: schema.authTokens.email,
      purpose: schema.authTokens.purpose,
      membershipId: schema.authTokens.membershipId,
    });
  return consumed[0] ?? null;
}

// OTP 校验：先原子计数（上限 MAX_OTP_ATTEMPTS），再比对，命中后原子消费。
// 返回 null 统一表示失败（不区分原因，防枚举）。
export async function verifyOtpCore(
  db: Database,
  email: string,
  otp: string,
  now: number,
): Promise<ConsumedToken | null> {
  const rows = await db
    .select()
    .from(schema.authTokens)
    .where(
      and(
        eq(schema.authTokens.email, email),
        eq(schema.authTokens.purpose, "login"),
        isNull(schema.authTokens.consumedAt),
        gt(schema.authTokens.expiresAt, now),
      ),
    )
    .orderBy(desc(schema.authTokens.createdAt))
    .limit(1);
  const record = rows[0];
  if (!record) {
    return null;
  }
  const counted = await db
    .update(schema.authTokens)
    .set({ attemptCount: sql`${schema.authTokens.attemptCount} + 1` })
    .where(
      and(
        eq(schema.authTokens.id, record.id),
        sql`${schema.authTokens.attemptCount} < ${MAX_OTP_ATTEMPTS}`,
      ),
    )
    .returning({ id: schema.authTokens.id });
  if (counted.length === 0) {
    return null;
  }
  if ((await sha256Hex(otp)) !== record.otpHash) {
    return null;
  }
  const consumed = await db
    .update(schema.authTokens)
    .set({ consumedAt: now })
    .where(and(eq(schema.authTokens.id, record.id), isNull(schema.authTokens.consumedAt)))
    .returning({ id: schema.authTokens.id });
  if (consumed.length === 0) {
    return null;
  }
  return { email: record.email, purpose: record.purpose, membershipId: record.membershipId };
}

// 按邮箱取回或创建用户
export async function ensureUser(db: Database, email: string, now: number): Promise<string> {
  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  const found = existing[0];
  if (found) {
    return found.id;
  }
  const userId = generateId(ID_PREFIXES.user);
  await db.insert(schema.users).values({ id: userId, email, createdAt: now });
  return userId;
}

// 邀请 token 消费后激活 membership（invited → active），幂等
export async function activateInvitedMembership(
  db: Database,
  membershipId: string,
  userId: string,
  now: number,
): Promise<string | null> {
  const rows = await db
    .update(schema.memberships)
    .set({ userId, status: "active", acceptedAt: now })
    .where(and(eq(schema.memberships.id, membershipId), eq(schema.memberships.status, "invited")))
    .returning({ organizationId: schema.memberships.organizationId });
  return rows[0]?.organizationId ?? null;
}

export interface ActiveMembership {
  id: string;
  role: "owner" | "staff" | "parent";
  staffAccess: boolean;
  // 邀请邮箱：parent 侧"发给我的邮件"按它过滤
  email: string;
}

// 租户隔离的核心查询：org + user + status=active 三条件缺一不可
export async function findActiveMembership(
  db: Database,
  orgId: string,
  userId: string,
): Promise<ActiveMembership | null> {
  const rows = await db
    .select({
      id: schema.memberships.id,
      role: schema.memberships.role,
      staffAccess: schema.memberships.staffAccess,
      email: schema.memberships.invitedEmail,
    })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.organizationId, orgId),
        eq(schema.memberships.userId, userId),
        eq(schema.memberships.status, "active"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
