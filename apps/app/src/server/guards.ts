import { findActiveMembership } from "@everband/core";
import type { Database } from "@everband/db";
import type { MembershipRole } from "@everband/domain";
import { getSessionUser, type SessionUser } from "./session.ts";

// 鉴权链（PRD §8.4）：session → membership(active) → role。
// 所有组织数据的 server function 必须经 requireMembership，
// orgId 只来自服务端校验，不信任客户端上下文。

export class AuthError extends Error {
  constructor(public readonly code: "unauthenticated" | "forbidden") {
    super(code);
  }
}

export async function requireUser(db: Database): Promise<SessionUser> {
  const user = await getSessionUser(db);
  if (!user) {
    throw new AuthError("unauthenticated");
  }
  return user;
}

export interface OrgContext {
  user: SessionUser;
  organizationId: string;
  membershipId: string;
  role: MembershipRole;
}

export async function requireMembership(
  db: Database,
  orgId: string,
  roles?: readonly MembershipRole[],
): Promise<OrgContext> {
  const user = await requireUser(db);
  const membership = await findActiveMembership(db, orgId, user.id);
  if (!membership) {
    throw new AuthError("forbidden");
  }
  if (roles && !roles.includes(membership.role)) {
    throw new AuthError("forbidden");
  }
  return {
    user,
    organizationId: orgId,
    membershipId: membership.id,
    role: membership.role,
  };
}

export const STAFF_ROLES = ["owner", "staff"] as const;
