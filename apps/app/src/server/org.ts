import { schema } from "@everband/db";
import { generateId, generateSecret, ID_PREFIXES, sha256Hex, tokenTtlMs } from "@everband/domain";
import { createOrganizationSchema, inviteStaffSchema, orgIdSchema } from "@everband/validation";
import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";
import { recordAudit } from "./audit.ts";
import { getDb } from "./context.ts";
import { getEmailSender } from "./email.ts";
import { requireMembership, requireUser, STAFF_ROLES } from "./guards.ts";

export const createOrganization = createServerFn({ method: "POST" })
  .inputValidator(createOrganizationSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const user = await requireUser(db);
    const now = Date.now();
    const orgId = generateId(ID_PREFIXES.organization);
    const membershipId = generateId(ID_PREFIXES.membership);

    await db.batch([
      db.insert(schema.organizations).values({
        id: orgId,
        name: data.name,
        type: data.type,
        timezone: data.timezone,
        contactEmail: data.contactEmail ?? null,
        createdAt: now,
      }),
      db.insert(schema.memberships).values({
        id: membershipId,
        organizationId: orgId,
        userId: user.id,
        role: "owner",
        status: "active",
        invitedEmail: user.email,
        acceptedAt: now,
        createdAt: now,
      }),
    ]);
    await recordAudit(db, {
      organizationId: orgId,
      actorMembershipId: membershipId,
      action: "organization.created",
      objectType: "organization",
      objectId: orgId,
      summary: { name: data.name, type: data.type, timezone: data.timezone },
    });
    return { ok: true as const, orgId };
  });

export const listMyOrganizations = createServerFn({ method: "GET" }).handler(async () => {
  const db = getDb();
  const user = await requireUser(db);
  return db
    .select({
      orgId: schema.organizations.id,
      name: schema.organizations.name,
      type: schema.organizations.type,
      role: schema.memberships.role,
    })
    .from(schema.memberships)
    .innerJoin(schema.organizations, eq(schema.memberships.organizationId, schema.organizations.id))
    .where(and(eq(schema.memberships.userId, user.id), eq(schema.memberships.status, "active")));
});

export const getOrgContext = createServerFn({ method: "GET" })
  .inputValidator(orgIdSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId);
    const orgs = await db
      .select({
        id: schema.organizations.id,
        name: schema.organizations.name,
        type: schema.organizations.type,
        timezone: schema.organizations.timezone,
      })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, ctx.organizationId))
      .limit(1);
    const org = orgs[0];
    if (!org) {
      throw new Error("Organization not found");
    }
    return { org, role: ctx.role, membershipId: ctx.membershipId, email: ctx.user.email };
  });

export const listOrgMemberships = createServerFn({ method: "GET" })
  .inputValidator(orgIdSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    await requireMembership(db, data.orgId, STAFF_ROLES);
    return db
      .select({
        id: schema.memberships.id,
        role: schema.memberships.role,
        status: schema.memberships.status,
        invitedEmail: schema.memberships.invitedEmail,
        acceptedAt: schema.memberships.acceptedAt,
        createdAt: schema.memberships.createdAt,
      })
      .from(schema.memberships)
      .where(eq(schema.memberships.organizationId, data.orgId));
  });

export const inviteStaff = createServerFn({ method: "POST" })
  .inputValidator(inviteStaffSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const now = Date.now();

    // 同组织同邮箱只允许一条非 removed 的 membership
    const existing = await db
      .select({ id: schema.memberships.id, status: schema.memberships.status })
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.organizationId, data.orgId),
          eq(schema.memberships.invitedEmail, data.email),
        ),
      );
    if (existing.some((m) => m.status === "active" || m.status === "invited")) {
      return {
        ok: false as const,
        error: "This email is already a member or has a pending invite.",
      };
    }

    const membershipId = generateId(ID_PREFIXES.membership);
    const token = generateSecret(32);
    await db.batch([
      db.insert(schema.memberships).values({
        id: membershipId,
        organizationId: data.orgId,
        role: "staff",
        status: "invited",
        invitedEmail: data.email,
        invitedByMembershipId: ctx.membershipId,
        createdAt: now,
      }),
      db.insert(schema.authTokens).values({
        id: generateId(ID_PREFIXES.authToken),
        email: data.email,
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
      organizationId: data.orgId,
      actorMembershipId: ctx.membershipId,
      action: "membership.invited",
      objectType: "membership",
      objectId: membershipId,
      summary: { email: data.email, role: "staff" },
    });

    const origin = getRequestUrl().origin;
    await getEmailSender(db).send({
      to: data.email,
      subject: "You're invited to join an organization on Everband",
      text: [
        "You've been invited to help run an organization on Everband.",
        "",
        `Accept the invite: ${origin}/invite/${token}`,
        "",
        "This link expires in 7 days.",
      ].join("\n"),
      kind: "invite",
    });
    return { ok: true as const };
  });
