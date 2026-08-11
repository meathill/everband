import { env } from "cloudflare:test";
import {
  addContactToStudent,
  createStudentCore,
  MemberError,
  updateStudentStatusCore,
  upsertContact,
} from "@everband/core";
import { createDb, schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const db = createDb(env.DB);
const NOW = 1_754_100_000_000;

let seq = 0;
function unique(prefix: string): string {
  seq += 1;
  return `${prefix}-${NOW}-${seq}-${Math.random().toString(36).slice(2, 6)}`;
}

async function seedOrg(): Promise<{ orgId: string; membershipId: string; groupId: string }> {
  const orgId = generateId(ID_PREFIXES.organization);
  const membershipId = generateId(ID_PREFIXES.membership);
  const groupId = generateId(ID_PREFIXES.group);
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
  await db.insert(schema.groups).values({
    id: groupId,
    organizationId: orgId,
    name: unique("Group"),
    createdAt: NOW,
  });
  return { orgId, membershipId, groupId };
}

describe("邮箱归并（upsertContact）", () => {
  it("同邮箱复用联系人与 household，姓名差异不产生新档案", async () => {
    const { orgId } = await seedOrg();
    const email = `${unique("parent")}@test.local`;

    const first = await upsertContact(
      db,
      orgId,
      { name: "Alice Wang", email, relationship: "parent" },
      NOW,
    );
    expect(first.created).toBe(true);

    const second = await upsertContact(
      db,
      orgId,
      { name: "A. Wang（另一种写法）", email, relationship: "guardian" },
      NOW,
    );
    expect(second.created).toBe(false);
    expect(second.contactId).toBe(first.contactId);
    expect(second.householdId).toBe(first.householdId);
  });

  it("不同组织的同邮箱各自独立建档", async () => {
    const a = await seedOrg();
    const b = await seedOrg();
    const email = `${unique("shared")}@test.local`;
    const inA = await upsertContact(db, a.orgId, { name: "P", email, relationship: "parent" }, NOW);
    const inB = await upsertContact(db, b.orgId, { name: "P", email, relationship: "parent" }, NOW);
    expect(inA.contactId).not.toBe(inB.contactId);
  });
});

describe("学生创建与约束", () => {
  it("一个联系人可关联多个学生（同一 household）", async () => {
    const { orgId, membershipId, groupId } = await seedOrg();
    const email = `${unique("multi")}@test.local`;
    const contact = { name: "Parent", email, relationship: "parent" as const };

    const s1 = await createStudentCore(
      db,
      orgId,
      { name: "Kid One", status: "active", groupId, contact },
      membershipId,
      NOW,
    );
    const s2 = await createStudentCore(
      db,
      orgId,
      { name: "Kid Two", status: "active", groupId, contact },
      membershipId,
      NOW,
    );
    expect(s1.contactId).toBe(s2.contactId);
    expect(s1.householdId).toBe(s2.householdId);
    expect(s1.studentId).not.toBe(s2.studentId);
  });

  it("Group 暂停后 active 学生可以无分组创建", async () => {
    const { orgId, membershipId } = await seedOrg();
    const created = await createStudentCore(
      db,
      orgId,
      {
        name: "No Group",
        status: "active",
        contact: { name: "P", email: `${unique("ng")}@test.local`, relationship: "parent" },
      },
      membershipId,
      NOW,
    );
    const rows = await db
      .select({ groupId: schema.students.groupId })
      .from(schema.students)
      .where(eq(schema.students.id, created.studentId));
    expect(rows[0]?.groupId).toBeNull();
  });

  it("拒绝其他组织的 group", async () => {
    const a = await seedOrg();
    const b = await seedOrg();
    await expect(
      createStudentCore(
        db,
        a.orgId,
        {
          name: "Cross",
          status: "active",
          groupId: b.groupId,
          contact: { name: "P", email: `${unique("x")}@test.local`, relationship: "parent" },
        },
        a.membershipId,
        NOW,
      ),
    ).rejects.toThrow(MemberError);
  });

  it("一个学生可关联多个联系人，重复关联幂等", async () => {
    const { orgId, membershipId, groupId } = await seedOrg();
    const { studentId } = await createStudentCore(
      db,
      orgId,
      {
        name: "Kid",
        status: "active",
        groupId,
        contact: { name: "P1", email: `${unique("p1")}@test.local`, relationship: "parent" },
      },
      membershipId,
      NOW,
    );
    const second = {
      name: "P2",
      email: `${unique("p2")}@test.local`,
      relationship: "guardian" as const,
    };
    await addContactToStudent(db, orgId, studentId, second, NOW);
    // 重复添加同一联系人：不报错不重复
    await addContactToStudent(db, orgId, studentId, second, NOW);

    const links = await db
      .select()
      .from(schema.studentContacts)
      .where(
        and(
          eq(schema.studentContacts.organizationId, orgId),
          eq(schema.studentContacts.studentId, studentId),
        ),
      );
    expect(links.length).toBe(2);
  });
});

describe("学生状态机（db 层）", () => {
  it("archived 后不能再转回 active", async () => {
    const { orgId, membershipId, groupId } = await seedOrg();
    const { studentId } = await createStudentCore(
      db,
      orgId,
      {
        name: "Kid",
        status: "active",
        groupId,
        contact: { name: "P", email: `${unique("st")}@test.local`, relationship: "parent" },
      },
      membershipId,
      NOW,
    );
    await updateStudentStatusCore(db, orgId, studentId, "archived", undefined, membershipId, NOW);
    await expect(
      updateStudentStatusCore(db, orgId, studentId, "active", groupId, membershipId, NOW),
    ).rejects.toThrow(MemberError);
  });

  it("withdrawn 回归 active 需要 group，且记录操作者", async () => {
    const { orgId, membershipId, groupId } = await seedOrg();
    const { studentId } = await createStudentCore(
      db,
      orgId,
      {
        name: "Kid",
        status: "active",
        groupId,
        contact: { name: "P", email: `${unique("wd")}@test.local`, relationship: "parent" },
      },
      membershipId,
      NOW,
    );
    await updateStudentStatusCore(db, orgId, studentId, "withdrawn", undefined, membershipId, NOW);
    await updateStudentStatusCore(
      db,
      orgId,
      studentId,
      "active",
      groupId,
      membershipId,
      NOW + 1000,
    );

    const rows = await db
      .select({
        status: schema.students.status,
        statusChangedAt: schema.students.statusChangedAt,
        statusChangedByMembershipId: schema.students.statusChangedByMembershipId,
      })
      .from(schema.students)
      .where(eq(schema.students.id, studentId));
    expect(rows[0]?.status).toBe("active");
    expect(rows[0]?.statusChangedAt).toBe(NOW + 1000);
    expect(rows[0]?.statusChangedByMembershipId).toBe(membershipId);
  });

  it("跨组织改学生被拒", async () => {
    const a = await seedOrg();
    const b = await seedOrg();
    const { studentId } = await createStudentCore(
      db,
      a.orgId,
      {
        name: "Kid",
        status: "active",
        groupId: a.groupId,
        contact: { name: "P", email: `${unique("iso")}@test.local`, relationship: "parent" },
      },
      a.membershipId,
      NOW,
    );
    await expect(
      updateStudentStatusCore(db, b.orgId, studentId, "withdrawn", undefined, b.membershipId, NOW),
    ).rejects.toThrow(MemberError);
  });
});
