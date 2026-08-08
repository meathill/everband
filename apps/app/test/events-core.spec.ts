import { env } from "cloudflare:test";
import {
  canParentAccessEvent,
  createStudentCore,
  ensureUser,
  linkContactsToUser,
  listParentEvents,
  resolveEventAudienceContacts,
  updateStudentStatusCore,
} from "@everband/core";
import { createDb, schema } from "@everband/db";
import { generateId, ID_PREFIXES, upcomingWindow } from "@everband/domain";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const db = createDb(env.DB);
const NOW = 1_754_300_000_000;

let seq = 0;
function unique(prefix: string): string {
  seq += 1;
  return `${prefix}-${NOW}-${seq}-${Math.random().toString(36).slice(2, 6)}`;
}

interface Seeded {
  orgId: string;
  membershipId: string;
  groupA: string;
  groupB: string;
  parentAUserId: string;
  parentAEmail: string;
}

// 组织：groupA/groupB；parentA 的 active 学生在 groupA
async function seed(): Promise<Seeded> {
  const orgId = generateId(ID_PREFIXES.organization);
  const membershipId = generateId(ID_PREFIXES.membership);
  const groupA = generateId(ID_PREFIXES.group);
  const groupB = generateId(ID_PREFIXES.group);
  await db.insert(schema.organizations).values({
    id: orgId,
    name: unique("Org"),
    type: "band",
    timezone: "Australia/Sydney",
    createdAt: NOW,
  });
  await db.insert(schema.memberships).values({
    id: membershipId,
    organizationId: orgId,
    role: "owner",
    status: "active",
    invitedEmail: `${unique("owner")}@test.local`,
    createdAt: NOW,
  });
  await db.insert(schema.groups).values([
    { id: groupA, organizationId: orgId, name: unique("A"), createdAt: NOW },
    { id: groupB, organizationId: orgId, name: unique("B"), createdAt: NOW },
  ]);

  const parentAEmail = `${unique("pa")}@test.local`;
  await createStudentCore(
    db,
    orgId,
    {
      name: "Kid A",
      status: "active",
      groupId: groupA,
      contact: { name: "Parent A", email: parentAEmail, relationship: "parent" },
    },
    membershipId,
    NOW,
  );
  const parentAUserId = await ensureUser(db, parentAEmail, NOW);
  await linkContactsToUser(db, parentAEmail, parentAUserId);
  return { orgId, membershipId, groupA, groupB, parentAUserId, parentAEmail };
}

async function seedEvent(
  seeded: Seeded,
  options: {
    status?: "draft" | "published" | "cancelled" | "completed";
    isOrgWide?: boolean;
    groupIds?: string[];
    startsAtUtc?: number;
  },
): Promise<string> {
  const eventId = generateId(ID_PREFIXES.event);
  await db.insert(schema.events).values({
    id: eventId,
    organizationId: seeded.orgId,
    title: unique("Event"),
    startsAtUtc: options.startsAtUtc ?? NOW + 24 * 3600 * 1000,
    isOrgWide: options.isOrgWide ?? false,
    status: options.status ?? "published",
    createdByMembershipId: seeded.membershipId,
    createdAt: NOW,
    updatedAt: NOW,
  });
  for (const groupId of options.groupIds ?? []) {
    await db.insert(schema.eventGroups).values({
      organizationId: seeded.orgId,
      eventId,
      groupId,
    });
  }
  return eventId;
}

describe("canParentAccessEvent", () => {
  it("自己 group 的活动可见，其他 group 不可见，org-wide 全可见", async () => {
    const seeded = await seed();
    const eventA = await seedEvent(seeded, { groupIds: [seeded.groupA] });
    const eventB = await seedEvent(seeded, { groupIds: [seeded.groupB] });
    const orgWide = await seedEvent(seeded, { isOrgWide: true });

    expect(await canParentAccessEvent(db, seeded.orgId, seeded.parentAUserId, eventA)).toBe(true);
    expect(await canParentAccessEvent(db, seeded.orgId, seeded.parentAUserId, eventB)).toBe(false);
    expect(await canParentAccessEvent(db, seeded.orgId, seeded.parentAUserId, orgWide)).toBe(true);
  });

  it("draft 活动对 parent 不可见；跨组织不可见", async () => {
    const seeded = await seed();
    const other = await seed();
    const draft = await seedEvent(seeded, { status: "draft", groupIds: [seeded.groupA] });
    const foreign = await seedEvent(other, { isOrgWide: true });

    expect(await canParentAccessEvent(db, seeded.orgId, seeded.parentAUserId, draft)).toBe(false);
    // 用 A 组织的 orgId 探测 B 组织的活动 → 拒绝
    expect(await canParentAccessEvent(db, seeded.orgId, seeded.parentAUserId, foreign)).toBe(false);
    // 用 B 组织的 orgId + A 的用户（非成员逻辑在 server 层，这里验证受众为空）
    expect(await canParentAccessEvent(db, other.orgId, seeded.parentAUserId, foreign)).toBe(true);
  });

  it("学生 withdrawn 后 group 活动不再可见（org-wide 仍可见）", async () => {
    const seeded = await seed();
    const eventA = await seedEvent(seeded, { groupIds: [seeded.groupA] });
    const orgWide = await seedEvent(seeded, { isOrgWide: true });
    expect(await canParentAccessEvent(db, seeded.orgId, seeded.parentAUserId, eventA)).toBe(true);

    const students = await db
      .select({ id: schema.students.id })
      .from(schema.students)
      .where(eq(schema.students.organizationId, seeded.orgId));
    const studentId = students[0]?.id;
    expect(studentId).toBeDefined();
    await updateStudentStatusCore(
      db,
      seeded.orgId,
      studentId ?? "",
      "withdrawn",
      undefined,
      seeded.membershipId,
      NOW + 1,
    );
    expect(await canParentAccessEvent(db, seeded.orgId, seeded.parentAUserId, eventA)).toBe(false);
    expect(await canParentAccessEvent(db, seeded.orgId, seeded.parentAUserId, orgWide)).toBe(true);
  });
});

describe("listParentEvents（30 天窗口）", () => {
  it("窗口外与 draft 活动不出现，cancelled 保留", async () => {
    const seeded = await seed();
    const inWindow = await seedEvent(seeded, { groupIds: [seeded.groupA] });
    const cancelled = await seedEvent(seeded, {
      status: "cancelled",
      groupIds: [seeded.groupA],
    });
    await seedEvent(seeded, { status: "draft", groupIds: [seeded.groupA] });
    await seedEvent(seeded, {
      groupIds: [seeded.groupA],
      startsAtUtc: NOW + 40 * 24 * 3600 * 1000,
    });
    await seedEvent(seeded, { groupIds: [seeded.groupB] });

    const window = upcomingWindow(NOW, "Australia/Sydney");
    const rows = await listParentEvents(db, seeded.orgId, seeded.parentAUserId, window);
    const ids = rows.map((row) => row.id);
    expect(ids).toContain(inWindow);
    expect(ids).toContain(cancelled);
    expect(ids).toHaveLength(2);
  });
});

describe("resolveEventAudienceContacts（邮箱去重）", () => {
  it("同邮箱多学生只出现一次；只含目标 group 的 active 学生", async () => {
    const seeded = await seed();
    // 同一联系人再挂一个 groupA 学生
    await createStudentCore(
      db,
      seeded.orgId,
      {
        name: "Kid A2",
        status: "active",
        groupId: seeded.groupA,
        contact: { name: "Parent A", email: seeded.parentAEmail, relationship: "parent" },
      },
      seeded.membershipId,
      NOW,
    );
    // groupB 学生（不同邮箱）不在受众内
    await createStudentCore(
      db,
      seeded.orgId,
      {
        name: "Kid B",
        status: "active",
        groupId: seeded.groupB,
        contact: { name: "Parent B", email: `${unique("pb")}@test.local`, relationship: "parent" },
      },
      seeded.membershipId,
      NOW,
    );

    const eventA = await seedEvent(seeded, { groupIds: [seeded.groupA] });
    const audience = await resolveEventAudienceContacts(db, seeded.orgId, eventA);
    expect(audience).toHaveLength(1);
    expect(audience[0]?.email).toBe(seeded.parentAEmail);
  });
});
