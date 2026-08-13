import { env } from "cloudflare:test";
import { setStaffAccessCore, transferOwnershipCore } from "@everband/core";
import { createDb, schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const db = createDb(env.DB);
const NOW = 1_754_600_000_000;

let seq = 0;
function unique(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}-${Math.random().toString(36).slice(2, 6)}`;
}

async function insertMembership(
  orgId: string,
  overrides: Partial<typeof schema.memberships.$inferInsert> = {},
): Promise<string> {
  const membershipId = generateId(ID_PREFIXES.membership);
  await db.insert(schema.memberships).values({
    id: membershipId,
    organizationId: orgId,
    role: "parent",
    status: "active",
    staffAccess: false,
    invitedEmail: `${unique("member")}@test.local`,
    createdAt: NOW,
    ...overrides,
  });
  return membershipId;
}

async function seedOrg(): Promise<{ orgId: string; ownerMembershipId: string }> {
  const orgId = generateId(ID_PREFIXES.organization);
  await db.insert(schema.organizations).values({
    id: orgId,
    name: unique("Org"),
    type: "band",
    timezone: "Australia/Sydney",
    createdAt: NOW,
  });
  const ownerMembershipId = await insertMembership(orgId, { role: "owner" });
  return { orgId, ownerMembershipId };
}

async function getMembership(membershipId: string): Promise<
  | {
      role: string;
      status: string;
      staffAccess: boolean;
    }
  | undefined
> {
  const rows = await db
    .select({
      role: schema.memberships.role,
      status: schema.memberships.status,
      staffAccess: schema.memberships.staffAccess,
    })
    .from(schema.memberships)
    .where(eq(schema.memberships.id, membershipId));
  return rows[0];
}

async function auditCount(orgId: string, objectId: string, action: string): Promise<number> {
  const rows = await db
    .select({ value: schema.auditEntries.id })
    .from(schema.auditEntries)
    .where(
      and(
        eq(schema.auditEntries.organizationId, orgId),
        eq(schema.auditEntries.objectId, objectId),
        eq(schema.auditEntries.action, action),
      ),
    );
  return rows.length;
}

describe("setStaffAccessCore（staff 授权位）", () => {
  it("授予与撤销 active parent，并各自记录审计", async () => {
    const { orgId, ownerMembershipId } = await seedOrg();
    const target = await insertMembership(orgId, { role: "parent" });

    const granted = await setStaffAccessCore(db, orgId, target, true, ownerMembershipId);
    expect(granted).toEqual({ ok: true });
    expect((await getMembership(target))?.staffAccess).toBe(true);
    expect(await auditCount(orgId, target, "membership.staff_granted")).toBe(1);

    const revoked = await setStaffAccessCore(db, orgId, target, false, ownerMembershipId);
    expect(revoked).toEqual({ ok: true });
    expect((await getMembership(target))?.staffAccess).toBe(false);
    expect(await auditCount(orgId, target, "membership.staff_revoked")).toBe(1);
  });

  it("幂等：重复授予不产生重复审计", async () => {
    const { orgId, ownerMembershipId } = await seedOrg();
    const target = await insertMembership(orgId, { role: "parent" });

    await setStaffAccessCore(db, orgId, target, true, ownerMembershipId);
    await setStaffAccessCore(db, orgId, target, true, ownerMembershipId);

    expect((await getMembership(target))?.staffAccess).toBe(true);
    expect(await auditCount(orgId, target, "membership.staff_granted")).toBe(1);
  });

  it("role 已是 staff 或 owner 的成员不能通过授权位改动", async () => {
    const { orgId, ownerMembershipId } = await seedOrg();
    const staff = await insertMembership(orgId, { role: "staff" });
    const owner = await insertMembership(orgId, { role: "owner" });

    expect(await setStaffAccessCore(db, orgId, staff, true, ownerMembershipId)).toEqual({
      ok: false,
      error: "Staff access can only be set on parent members.",
    });
    expect(await setStaffAccessCore(db, orgId, owner, true, ownerMembershipId)).toEqual({
      ok: false,
      error: "Staff access can only be set on parent members.",
    });
    expect(await setStaffAccessCore(db, orgId, staff, false, ownerMembershipId)).toEqual({
      ok: false,
      error: "Staff access can only be set on parent members.",
    });
  });

  it("非 active 或跨组织的成员不能改动", async () => {
    const { orgId, ownerMembershipId } = await seedOrg();
    const suspended = await insertMembership(orgId, { status: "suspended" });
    const other = await seedOrg();

    expect(await setStaffAccessCore(db, orgId, suspended, true, ownerMembershipId)).toEqual({
      ok: false,
      error: "Only active members can be granted or revoked staff access.",
    });
    expect(
      await setStaffAccessCore(db, orgId, other.ownerMembershipId, true, ownerMembershipId),
    ).toEqual({
      ok: false,
      error: "Membership not found.",
    });
  });
});

describe("transferOwnershipCore（owner 转移）", () => {
  it("转移给 active staff：目标变 owner，原 owner 变 staff，记录审计", async () => {
    const { orgId, ownerMembershipId } = await seedOrg();
    const target = await insertMembership(orgId, { role: "staff" });

    const result = await transferOwnershipCore(db, orgId, target, ownerMembershipId);
    expect(result).toEqual({ ok: true });

    expect((await getMembership(target))?.role).toBe("owner");
    expect((await getMembership(target))?.status).toBe("active");
    expect((await getMembership(ownerMembershipId))?.role).toBe("staff");
    expect((await getMembership(ownerMembershipId))?.status).toBe("active");
    expect(await auditCount(orgId, target, "membership.owner_transferred")).toBe(1);
  });

  it("具备 staffAccess 的 parent 也可以接收", async () => {
    const { orgId, ownerMembershipId } = await seedOrg();
    const target = await insertMembership(orgId, { role: "parent", staffAccess: true });

    expect((await transferOwnershipCore(db, orgId, target, ownerMembershipId)).ok).toBe(true);
    expect((await getMembership(target))?.role).toBe("owner");
  });

  it("普通 parent、非 active、owner 自己都不能接收", async () => {
    const { orgId, ownerMembershipId } = await seedOrg();
    const parent = await insertMembership(orgId, { role: "parent" });
    const suspendedStaff = await insertMembership(orgId, { role: "staff", status: "suspended" });

    expect(await transferOwnershipCore(db, orgId, parent, ownerMembershipId)).toEqual({
      ok: false,
      error: "Ownership can only be transferred to an active staff member.",
    });
    expect(await transferOwnershipCore(db, orgId, suspendedStaff, ownerMembershipId)).toEqual({
      ok: false,
      error: "Ownership can only be transferred to an active staff member.",
    });
    expect(await transferOwnershipCore(db, orgId, ownerMembershipId, ownerMembershipId)).toEqual({
      ok: false,
      error: "Ownership can only be transferred to an active staff member.",
    });
    expect((await getMembership(ownerMembershipId))?.role).toBe("owner");
  });

  it("跨组织的成员不能接收", async () => {
    const { orgId, ownerMembershipId } = await seedOrg();
    const other = await seedOrg();

    expect(
      await transferOwnershipCore(db, orgId, other.ownerMembershipId, ownerMembershipId),
    ).toEqual({
      ok: false,
      error: "Membership not found.",
    });
  });
});
