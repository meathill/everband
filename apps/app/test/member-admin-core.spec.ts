import { env } from "cloudflare:test";
import {
  type ListStudentsInput,
  listStudentsCore,
  updateGroupCore,
  updateStudentCore,
} from "@everband/core";
import { createDb, schema } from "@everband/db";
import type { StudentStatus } from "@everband/domain";
import { generateId, ID_PREFIXES } from "@everband/domain";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const db = createDb(env.DB);
const NOW = 1_754_400_000_000;
const DAY = 24 * 3600 * 1000;

let seq = 0;
function unique(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}-${Math.random().toString(36).slice(2, 6)}`;
}

interface Seeded {
  orgId: string;
  membershipId: string;
  householdId: string;
  groupA: string;
  groupB: string;
}

async function seed(): Promise<Seeded> {
  const orgId = generateId(ID_PREFIXES.organization);
  const membershipId = generateId(ID_PREFIXES.membership);
  const householdId = generateId(ID_PREFIXES.household);
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
  await db.insert(schema.households).values({
    id: householdId,
    organizationId: orgId,
    name: unique("Household"),
    createdAt: NOW,
  });
  await db.insert(schema.groups).values([
    { id: groupA, organizationId: orgId, name: unique("A"), createdAt: NOW },
    { id: groupB, organizationId: orgId, name: unique("B"), createdAt: NOW },
  ]);
  return { orgId, membershipId, householdId, groupA, groupB };
}

interface SeedStudentOptions {
  name?: string;
  status?: StudentStatus;
  groupId?: string | null;
  createdAt?: number;
}

async function seedStudent(seeded: Seeded, options: SeedStudentOptions = {}): Promise<string> {
  const studentId = generateId(ID_PREFIXES.student);
  await db.insert(schema.students).values({
    id: studentId,
    organizationId: seeded.orgId,
    householdId: seeded.householdId,
    name: options.name ?? unique("Student"),
    status: options.status ?? "active",
    groupId: options.groupId === undefined ? seeded.groupA : options.groupId,
    statusChangedAt: NOW,
    statusChangedByMembershipId: seeded.membershipId,
    createdAt: options.createdAt ?? NOW,
  });
  return studentId;
}

const BASE_QUERY: ListStudentsInput = {
  page: 1,
  pageSize: 20,
  sort: "name",
  order: "asc",
  status: "all",
  group: "all",
};

function list(seeded: Seeded, patch: Partial<ListStudentsInput> = {}) {
  return listStudentsCore(db, seeded.orgId, { ...BASE_QUERY, ...patch });
}

function updateGroup(
  seeded: Seeded,
  groupId: string,
  input: { name?: string; status?: "active" | "archived" },
  now = NOW,
) {
  return updateGroupCore(db, seeded.orgId, groupId, input, seeded.membershipId, now);
}

interface SeedSeriesOptions {
  groupId?: string;
  isEnabled?: boolean;
  /** 场次的开始时间；不传即未来一天 */
  occurrenceStartsAtUtc?: number;
  occurrenceStatus?: "scheduled" | "cancelled";
}

/** 一条 series + 一个场次；active 的判定与 listRehearsalSeriesCore 一致 */
async function seedSeries(seeded: Seeded, options: SeedSeriesOptions = {}): Promise<string> {
  const termId = generateId(ID_PREFIXES.term);
  const seriesId = generateId(ID_PREFIXES.rehearsalSeries);
  await db.insert(schema.terms).values({
    id: termId,
    organizationId: seeded.orgId,
    name: unique("Term"),
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    createdAt: NOW,
  });
  await db.insert(schema.rehearsalSeries).values({
    id: seriesId,
    organizationId: seeded.orgId,
    termId,
    groupId: options.groupId ?? seeded.groupA,
    weekday: 3,
    startTimeLocal: "18:00",
    endTimeLocal: "19:30",
    helpersNeeded: 1,
    isEnabled: options.isEnabled ?? true,
    createdAt: NOW,
  });
  const startsAtUtc = options.occurrenceStartsAtUtc ?? NOW + DAY;
  await db.insert(schema.rehearsalOccurrences).values({
    id: generateId(ID_PREFIXES.rehearsalOccurrence),
    organizationId: seeded.orgId,
    seriesId,
    localDate: new Date(startsAtUtc).toISOString().slice(0, 10),
    startsAtUtc,
    endsAtUtc: startsAtUtc + 5_400_000,
    status: options.occurrenceStatus ?? "scheduled",
    createdAt: NOW,
  });
  return seriesId;
}

async function auditActions(orgId: string, objectId: string): Promise<string[]> {
  const rows = await db
    .select({ action: schema.auditEntries.action })
    .from(schema.auditEntries)
    .where(
      and(
        eq(schema.auditEntries.organizationId, orgId),
        eq(schema.auditEntries.objectId, objectId),
      ),
    );
  return rows.map((row) => row.action);
}

describe("listStudentsCore 分页与排序", () => {
  it("total 是筛选后的总数，翻页边界不重不漏", async () => {
    const seeded = await seed();
    for (let index = 0; index < 5; index += 1) {
      await seedStudent(seeded, { name: `${unique("S")}-${index}` });
    }

    const first = await list(seeded, { pageSize: 2 });
    expect(first.total).toBe(5);
    expect(first.items).toHaveLength(2);
    expect(first.page).toBe(1);

    const second = await list(seeded, { page: 2, pageSize: 2 });
    const third = await list(seeded, { page: 3, pageSize: 2 });
    expect(third.items).toHaveLength(1);

    const ids = [...first.items, ...second.items, ...third.items].map((row) => row.id);
    expect(new Set(ids).size).toBe(5);

    const beyond = await list(seeded, { page: 9, pageSize: 2 });
    expect(beyond.items).toHaveLength(0);
    expect(beyond.total).toBe(5);
  });

  it("按创建时间倒序排序，且带上分组名与联系人", async () => {
    const seeded = await seed();
    const older = await seedStudent(seeded, { createdAt: NOW - DAY });
    const newer = await seedStudent(seeded, { createdAt: NOW });

    const contactId = generateId(ID_PREFIXES.contact);
    await db.insert(schema.contacts).values({
      id: contactId,
      organizationId: seeded.orgId,
      householdId: seeded.householdId,
      name: "Jamie",
      email: `${unique("jamie")}@test.local`,
      createdAt: NOW,
    });
    await db.insert(schema.studentContacts).values({
      organizationId: seeded.orgId,
      studentId: newer,
      contactId,
      relationship: "parent",
    });

    const result = await list(seeded, { sort: "createdAt", order: "desc" });
    expect(result.items.map((row) => row.id)).toEqual([newer, older]);
    expect(result.items[0]?.groupName).toBeTruthy();
    expect(result.items[0]?.contacts.map((contact) => contact.contactName)).toEqual(["Jamie"]);
    // 联系人只挂在自己的学生上
    expect(result.items[1]?.contacts).toHaveLength(0);
  });

  it("未知排序字段回落到默认列而不是拼进 SQL", async () => {
    const seeded = await seed();
    await seedStudent(seeded, { name: "Bea" });
    await seedStudent(seeded, { name: "Ada" });

    const result = await list(seeded, { sort: "name; drop table students" });
    expect(result.items.map((row) => row.name)).toEqual(["Ada", "Bea"]);
  });
});

describe("listStudentsCore 搜索与筛选", () => {
  it("按姓名模糊搜索，通配符被转义", async () => {
    const seeded = await seed();
    await seedStudent(seeded, { name: "Nina Wang" });
    await seedStudent(seeded, { name: "Nick Lee" });
    await seedStudent(seeded, { name: "50% Off" });

    expect((await list(seeded, { q: "nin" })).items.map((row) => row.name)).toEqual(["Nina Wang"]);
    // "%" 是字面量，不该匹配到所有人
    const escaped = await list(seeded, { q: "50%" });
    expect(escaped.items.map((row) => row.name)).toEqual(["50% Off"]);
  });

  it("status=all 不含 archived，显式选 archived 才能看到", async () => {
    const seeded = await seed();
    const active = await seedStudent(seeded, { status: "active" });
    const withdrawn = await seedStudent(seeded, { status: "withdrawn", groupId: null });
    const archived = await seedStudent(seeded, { status: "archived", groupId: null });

    const defaultView = await list(seeded);
    expect(defaultView.total).toBe(2);
    expect(new Set(defaultView.items.map((row) => row.id))).toEqual(new Set([active, withdrawn]));

    const archivedView = await list(seeded, { status: "archived" });
    expect(archivedView.items.map((row) => row.id)).toEqual([archived]);

    const activeView = await list(seeded, { status: "active" });
    expect(activeView.items.map((row) => row.id)).toEqual([active]);
  });

  it("按分组筛选", async () => {
    const seeded = await seed();
    const inA = await seedStudent(seeded, { groupId: seeded.groupA });
    await seedStudent(seeded, { groupId: seeded.groupB });

    const result = await list(seeded, { group: seeded.groupA });
    expect(result.total).toBe(1);
    expect(result.items[0]?.id).toBe(inA);
  });
});

describe("updateStudentCore", () => {
  it("改名换组并记 audit", async () => {
    const seeded = await seed();
    const studentId = await seedStudent(seeded, { name: "Old name" });

    const result = await updateStudentCore(
      db,
      seeded.orgId,
      studentId,
      { name: "New name", groupId: seeded.groupB },
      seeded.membershipId,
    );
    expect(result.ok).toBe(true);

    const rows = await db
      .select({ name: schema.students.name, groupId: schema.students.groupId })
      .from(schema.students)
      .where(eq(schema.students.id, studentId));
    expect(rows[0]).toEqual({ name: "New name", groupId: seeded.groupB });
    expect(await auditActions(seeded.orgId, studentId)).toContain("student.updated");
  });

  it("Group 暂停后 active 与非 active 学生都可以移出分组", async () => {
    const seeded = await seed();
    const activeStudent = await seedStudent(seeded, { status: "active" });
    const interested = await seedStudent(seeded, { status: "interested" });

    const activeResult = await updateStudentCore(
      db,
      seeded.orgId,
      activeStudent,
      { groupId: null },
      seeded.membershipId,
    );
    expect(activeResult.ok).toBe(true);

    const allowed = await updateStudentCore(
      db,
      seeded.orgId,
      interested,
      { groupId: null },
      seeded.membershipId,
    );
    expect(allowed.ok).toBe(true);
  });

  it("跨组织的学生与不存在的分组都会被拒绝", async () => {
    const seeded = await seed();
    const other = await seed();
    const studentId = await seedStudent(seeded);

    expect(
      (await updateStudentCore(db, other.orgId, studentId, { name: "X" }, other.membershipId)).ok,
    ).toBe(false);
    expect(
      (
        await updateStudentCore(
          db,
          seeded.orgId,
          studentId,
          { groupId: other.groupA },
          seeded.membershipId,
        )
      ).ok,
    ).toBe(false);
  });
});

describe("updateGroupCore", () => {
  it("改名后写回并记 audit", async () => {
    const seeded = await seed();
    const name = unique("Renamed");

    const result = await updateGroup(seeded, seeded.groupA, { name });
    expect(result.ok).toBe(true);

    const rows = await db
      .select({ name: schema.groups.name })
      .from(schema.groups)
      .where(eq(schema.groups.id, seeded.groupA));
    expect(rows[0]?.name).toBe(name);
    expect(await auditActions(seeded.orgId, seeded.groupA)).toContain("group.updated");
  });

  it("归档后从 active 列表消失，restore 后回来", async () => {
    const seeded = await seed();

    expect((await updateGroup(seeded, seeded.groupA, { status: "archived" })).ok).toBe(true);

    const activeIds = async () =>
      (
        await db
          .select({ id: schema.groups.id })
          .from(schema.groups)
          .where(
            and(
              eq(schema.groups.organizationId, seeded.orgId),
              eq(schema.groups.status, "active" as const),
            ),
          )
      ).map((row) => row.id);

    expect(await activeIds()).not.toContain(seeded.groupA);

    expect((await updateGroup(seeded, seeded.groupA, { status: "active" })).ok).toBe(true);
    expect(await activeIds()).toContain(seeded.groupA);
  });

  it("还有在册学生或未结束活动时拒绝归档", async () => {
    const seeded = await seed();
    const studentId = await seedStudent(seeded, { groupId: seeded.groupA });

    const blockedByStudent = await updateGroup(seeded, seeded.groupA, { status: "archived" });
    expect(blockedByStudent.ok).toBe(false);

    // 学生挪走后换成活动挡路
    await updateStudentCore(
      db,
      seeded.orgId,
      studentId,
      { groupId: seeded.groupB },
      seeded.membershipId,
    );
    const eventId = generateId(ID_PREFIXES.event);
    await db.insert(schema.events).values({
      id: eventId,
      organizationId: seeded.orgId,
      title: unique("Event"),
      startsAtUtc: NOW + DAY,
      isOrgWide: false,
      status: "published",
      createdByMembershipId: seeded.membershipId,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.insert(schema.eventGroups).values({
      organizationId: seeded.orgId,
      eventId,
      groupId: seeded.groupA,
    });

    const blockedByEvent = await updateGroup(seeded, seeded.groupA, { status: "archived" });
    expect(blockedByEvent.ok).toBe(false);

    // 活动取消后放行
    await db
      .update(schema.events)
      .set({ status: "cancelled" })
      .where(eq(schema.events.id, eventId));
    const allowed = await updateGroup(seeded, seeded.groupA, { status: "archived" });
    expect(allowed.ok).toBe(true);
  });

  it("还有 active 排练 series 时拒绝归档", async () => {
    const seeded = await seed();
    const seriesId = await seedSeries(seeded, { groupId: seeded.groupA });

    const blocked = await updateGroup(seeded, seeded.groupA, { status: "archived" });
    expect(blocked).toEqual({
      ok: false,
      error: "End the rehearsal series for this group first.",
    });

    // series 结束（isEnabled=false）后放行
    await db
      .update(schema.rehearsalSeries)
      .set({ isEnabled: false })
      .where(eq(schema.rehearsalSeries.id, seriesId));
    expect((await updateGroup(seeded, seeded.groupA, { status: "archived" })).ok).toBe(true);
  });

  it("场次全部过去或被取消的 series 不挡归档", async () => {
    const seeded = await seed();
    // 只剩历史场次
    await seedSeries(seeded, { groupId: seeded.groupA, occurrenceStartsAtUtc: NOW - DAY });
    expect((await updateGroup(seeded, seeded.groupA, { status: "archived" })).ok).toBe(true);

    // 未来场次但已取消
    const other = await seed();
    await seedSeries(other, { groupId: other.groupA, occurrenceStatus: "cancelled" });
    expect((await updateGroup(other, other.groupA, { status: "archived" })).ok).toBe(true);
  });

  it("其他分组的 active series 不影响本组归档", async () => {
    const seeded = await seed();
    await seedSeries(seeded, { groupId: seeded.groupB });
    expect((await updateGroup(seeded, seeded.groupA, { status: "archived" })).ok).toBe(true);
  });

  it("归档分组不能再接收学生", async () => {
    const seeded = await seed();
    const studentId = await seedStudent(seeded, { groupId: seeded.groupA });
    await updateGroup(seeded, seeded.groupB, { status: "archived" });

    const result = await updateStudentCore(
      db,
      seeded.orgId,
      studentId,
      { groupId: seeded.groupB },
      seeded.membershipId,
    );
    expect(result.ok).toBe(false);
  });
});
