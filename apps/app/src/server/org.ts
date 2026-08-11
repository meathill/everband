import { recordAudit, updateOrganizationCore } from "@everband/core";
import { schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
import {
  createOrganizationSchema,
  inviteStaffSchema,
  orgIdSchema,
  updateOrganizationSchema,
} from "@everband/validation";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequestUrl } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "./context.ts";
import { OWNER_ROLES, requireMembership, requireUser, STAFF_ROLES } from "./guards.ts";
import { createInvite } from "./invites.ts";

export const createOrganization = createServerFn({ method: "POST" })
  .validator(createOrganizationSchema)
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

// 侧边栏展开状态存在 sidebar_state cookie（由 ui 的 SidebarProvider 写入）。
// 布局 loader 读它作为 defaultOpen，保证 SSR 首屏与用户上次选择一致，不会闪一下。
export const getSidebarOpen = createServerFn({ method: "GET" }).handler(() => {
  return getCookie("sidebar_state") !== "false";
});

export const getOrgContext = createServerFn({ method: "GET" })
  .validator(orgIdSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId);
    const orgs = await db
      .select({
        id: schema.organizations.id,
        name: schema.organizations.name,
        type: schema.organizations.type,
        timezone: schema.organizations.timezone,
        currencyCode: schema.organizations.currencyCode,
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

// 组织设置：改名与改时区，owner 专属
export const updateOrganization = createServerFn({ method: "POST" })
  .validator(updateOrganizationSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, OWNER_ROLES);
    return updateOrganizationCore(
      db,
      data.orgId,
      { name: data.name, timezone: data.timezone },
      ctx.membershipId,
    );
  });

export const listOrgMemberships = createServerFn({ method: "GET" })
  .validator(orgIdSchema)
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
  .validator(inviteStaffSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    return createInvite(db, ctx, data.email, "staff", getRequestUrl().origin);
  });
