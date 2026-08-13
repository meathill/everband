// 组织自身设置与学期的写操作核心（settings 页背后的逻辑）。
// 成员/分组的写操作在 member-admin.ts，活动在 event-admin.ts，三者互不依赖。

import type { Database } from "@everband/db";
import { schema } from "@everband/db";
import { canGrantStaffAccess, canTransferOwnership } from "@everband/domain";
import { and, count, eq } from "drizzle-orm";
import { recordAudit } from "./audit.ts";

export type OrgWriteResult = { ok: true } | { ok: false; error: string };

export interface UpdateOrganizationCoreInput {
  name?: string;
  timezone?: string;
}

/**
 * 改组织名 / 时区。时区是全站时间显示与排练展开的基准，改动会立刻影响所有已存在的
 * 时间展示（存的是 UTC 毫秒，显示端按组织时区格式化），所以要在 UI 上说清楚，
 * 并把新旧值记进审计。
 */
export async function updateOrganizationCore(
  db: Database,
  orgId: string,
  input: UpdateOrganizationCoreInput,
  actorMembershipId: string,
): Promise<OrgWriteResult> {
  const rows = await db
    .select({ name: schema.organizations.name, timezone: schema.organizations.timezone })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, orgId))
    .limit(1);
  const current = rows[0];
  if (!current) {
    return { ok: false, error: "Organization not found." };
  }

  const next = {
    name: input.name ?? current.name,
    timezone: input.timezone ?? current.timezone,
  };
  if (next.name === current.name && next.timezone === current.timezone) {
    return { ok: true };
  }

  await db.update(schema.organizations).set(next).where(eq(schema.organizations.id, orgId));
  await recordAudit(db, {
    organizationId: orgId,
    actorMembershipId,
    action: "organization.updated",
    objectType: "organization",
    objectId: orgId,
    summary: { from: current, to: next },
  });
  return { ok: true };
}

export interface UpdateTermCoreInput {
  name?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * 改学期。起止日期已由 schema 保证成对出现且先后正确，这里只补"必须落在同一组织内"
 * 与重名冲突两条。缩短区间不回收已展开的排练场次——那是 rehearsals 的职责边界，
 * 这里不越界处理。
 */
export async function updateTermCore(
  db: Database,
  orgId: string,
  termId: string,
  input: UpdateTermCoreInput,
  actorMembershipId: string,
): Promise<OrgWriteResult> {
  const rows = await db
    .select({
      name: schema.terms.name,
      startDate: schema.terms.startDate,
      endDate: schema.terms.endDate,
    })
    .from(schema.terms)
    .where(and(eq(schema.terms.id, termId), eq(schema.terms.organizationId, orgId)))
    .limit(1);
  const current = rows[0];
  if (!current) {
    return { ok: false, error: "Term not found." };
  }

  const next = {
    name: input.name ?? current.name,
    startDate: input.startDate ?? current.startDate,
    endDate: input.endDate ?? current.endDate,
  };
  if (next.startDate > next.endDate) {
    return { ok: false, error: "Start date must be before end date." };
  }

  try {
    await db
      .update(schema.terms)
      .set(next)
      .where(and(eq(schema.terms.id, termId), eq(schema.terms.organizationId, orgId)));
  } catch {
    // UNIQUE(organizationId, name)
    return { ok: false, error: "A term with this name already exists." };
  }

  await recordAudit(db, {
    organizationId: orgId,
    actorMembershipId,
    action: "term.updated",
    objectType: "term",
    objectId: termId,
    summary: { from: current, to: next },
  });
  return { ok: true };
}

/**
 * 删学期。排练系列以 termId 为展开边界（rehearsal_series.term_id NOT NULL），
 * 删掉被引用的学期会留下无法解释的排练，所以有引用一律拒绝，让用户先处理排练。
 * 目前 terms 只有这一处外键引用，新增引用方时要同步扩展这里的检查。
 */
export async function deleteTermCore(
  db: Database,
  orgId: string,
  termId: string,
  actorMembershipId: string,
): Promise<OrgWriteResult> {
  const rows = await db
    .select({ name: schema.terms.name })
    .from(schema.terms)
    .where(and(eq(schema.terms.id, termId), eq(schema.terms.organizationId, orgId)))
    .limit(1);
  const current = rows[0];
  if (!current) {
    return { ok: false, error: "Term not found." };
  }

  const referencing = await db
    .select({ value: count() })
    .from(schema.rehearsalSeries)
    .where(
      and(
        eq(schema.rehearsalSeries.organizationId, orgId),
        eq(schema.rehearsalSeries.termId, termId),
      ),
    );
  if ((referencing[0]?.value ?? 0) > 0) {
    return {
      ok: false,
      error: "This term still has rehearsals. Remove them before deleting the term.",
    };
  }

  await db
    .delete(schema.terms)
    .where(and(eq(schema.terms.id, termId), eq(schema.terms.organizationId, orgId)));
  await recordAudit(db, {
    organizationId: orgId,
    actorMembershipId,
    action: "term.deleted",
    objectType: "term",
    objectId: termId,
    summary: { name: current.name },
  });
  return { ok: true };
}

// ---- staff 授权位与 owner 转移（PRD §3.2，staff 管理只限 owner）----
// 权限本身由 server 层 requireMembership(OWNER_ROLES) 保证，这里只做数据级校验。

export interface MembershipRow {
  id: string;
  role: "owner" | "staff" | "parent";
  status: "invited" | "active" | "suspended" | "removed";
  staffAccess: boolean;
  invitedEmail: string;
}

export async function getMembershipRow(
  db: Database,
  orgId: string,
  membershipId: string,
): Promise<MembershipRow | null> {
  const rows = await db
    .select({
      id: schema.memberships.id,
      role: schema.memberships.role,
      status: schema.memberships.status,
      staffAccess: schema.memberships.staffAccess,
      invitedEmail: schema.memberships.invitedEmail,
    })
    .from(schema.memberships)
    .where(
      and(eq(schema.memberships.id, membershipId), eq(schema.memberships.organizationId, orgId)),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * 授予/撤销 staff 授权位（parent 身份上叠加的运营权限）。
 *
 * 规则：目标必须是 active 的 parent 身份（role = staff 的成员权限来自角色本身，
 * owner 是最高权限，两者都不能被这个操作改动）；grant/revoke 幂等，
 * 状态已满足时直接返回成功。每次变更写审计。
 */
export async function setStaffAccessCore(
  db: Database,
  orgId: string,
  targetMembershipId: string,
  staffAccess: boolean,
  actorMembershipId: string,
): Promise<OrgWriteResult> {
  const target = await getMembershipRow(db, orgId, targetMembershipId);
  if (!target) {
    return { ok: false, error: "Membership not found." };
  }
  if (target.status !== "active") {
    return { ok: false, error: "Only active members can be granted or revoked staff access." };
  }
  if (!canGrantStaffAccess(target.role)) {
    return { ok: false, error: "Staff access can only be set on parent members." };
  }
  if (target.staffAccess === staffAccess) {
    return { ok: true };
  }

  await db
    .update(schema.memberships)
    .set({ staffAccess })
    .where(eq(schema.memberships.id, targetMembershipId));
  await recordAudit(db, {
    organizationId: orgId,
    actorMembershipId,
    action: staffAccess ? "membership.staff_granted" : "membership.staff_revoked",
    objectType: "membership",
    objectId: targetMembershipId,
    summary: { email: target.invitedEmail, staffAccess },
  });
  return { ok: true };
}

/**
 * 转移 owner 权限。
 *
 * 规则（PRD §3.2）：目标必须是 active 且具备 staff 权限（role = staff 或
 * staffAccess = true）的成员；转移后目标成为新 owner，原 owner 自动变为 staff
 * （staffAccess 保持原值——owner 的授权位本就无意义）。组织始终只保留一个 owner。
 */
export async function transferOwnershipCore(
  db: Database,
  orgId: string,
  targetMembershipId: string,
  actorMembershipId: string,
): Promise<OrgWriteResult> {
  const target = await getMembershipRow(db, orgId, targetMembershipId);
  if (!target) {
    return { ok: false, error: "Membership not found." };
  }
  if (!canTransferOwnership(target)) {
    return {
      ok: false,
      error: "Ownership can only be transferred to an active staff member.",
    };
  }

  await db.batch([
    db
      .update(schema.memberships)
      .set({ role: "owner" })
      .where(eq(schema.memberships.id, targetMembershipId)),
    db
      .update(schema.memberships)
      .set({ role: "staff" })
      .where(eq(schema.memberships.id, actorMembershipId)),
  ]);
  await recordAudit(db, {
    organizationId: orgId,
    actorMembershipId,
    action: "membership.owner_transferred",
    objectType: "membership",
    objectId: targetMembershipId,
    summary: {
      fromMembershipId: actorMembershipId,
      toMembershipId: targetMembershipId,
      toEmail: target.invitedEmail,
    },
  });
  return { ok: true };
}
