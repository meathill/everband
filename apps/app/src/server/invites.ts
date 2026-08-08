// 邀请通用逻辑：staff 与 parent 邀请共用（membership + invite token + 邮件 + audit）。

import type { Database } from "@everband/db";
import { schema } from "@everband/db";
import {
  generateId,
  generateSecret,
  ID_PREFIXES,
  type MembershipRole,
  sha256Hex,
  tokenTtlMs,
} from "@everband/domain";
import { and, eq } from "drizzle-orm";
import { recordAudit } from "./audit.ts";
import { getEmailSender } from "./email.ts";
import type { OrgContext } from "./guards.ts";

export async function createInvite(
  db: Database,
  ctx: OrgContext,
  email: string,
  role: Exclude<MembershipRole, "owner">,
  origin: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = Date.now();
  const existing = await db
    .select({ id: schema.memberships.id, status: schema.memberships.status })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.organizationId, ctx.organizationId),
        eq(schema.memberships.invitedEmail, email),
      ),
    );
  if (existing.some((m) => m.status === "active" || m.status === "invited")) {
    return { ok: false, error: "This email is already a member or has a pending invite." };
  }

  const membershipId = generateId(ID_PREFIXES.membership);
  const token = generateSecret(32);
  await db.batch([
    db.insert(schema.memberships).values({
      id: membershipId,
      organizationId: ctx.organizationId,
      role,
      status: "invited",
      invitedEmail: email,
      invitedByMembershipId: ctx.membershipId,
      createdAt: now,
    }),
    db.insert(schema.authTokens).values({
      id: generateId(ID_PREFIXES.authToken),
      email,
      tokenHash: await sha256Hex(token),
      // 邀请只走链接，不发 OTP；占位哈希不可能被 6 位数字命中
      otpHash: await sha256Hex(`invite:${token}`),
      purpose: "invite",
      membershipId,
      expiresAt: now + tokenTtlMs("invite"),
      createdAt: now,
    }),
  ]);
  await recordAudit(db, {
    organizationId: ctx.organizationId,
    actorMembershipId: ctx.membershipId,
    action: "membership.invited",
    objectType: "membership",
    objectId: membershipId,
    summary: { email, role },
  });

  const roleText =
    role === "staff"
      ? "You've been invited to help run an organization on Everband."
      : "You've been invited to follow your student's events and rehearsals on Everband.";
  await getEmailSender(db).send({
    to: email,
    subject: "You're invited to join an organization on Everband",
    text: [
      roleText,
      "",
      `Accept the invite: ${origin}/invite/${token}`,
      "",
      "This link expires in 7 days.",
    ].join("\n"),
    kind: "invite",
  });
  return { ok: true };
}
