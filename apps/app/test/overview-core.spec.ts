import { env } from "cloudflare:test";
import { getParentOverviewData, getStaffOverviewData } from "@everband/core";
import { createDb, schema } from "@everband/db";
import { generateId, ID_PREFIXES, monthWindow } from "@everband/domain";
import { describe, expect, it } from "vitest";

const db = createDb(env.DB);
const NOW = Date.parse("2026-08-11T08:00:00Z");
const AUGUST = monthWindow("2026-08", "Australia/Sydney");

let sequence = 0;
function unique(prefix: string): string {
  sequence += 1;
  return `${prefix}-${NOW}-${sequence}-${Math.random().toString(36).slice(2, 6)}`;
}

async function seedOrg(): Promise<{ orgId: string; membershipId: string }> {
  const orgId = generateId(ID_PREFIXES.organization);
  const membershipId = generateId(ID_PREFIXES.membership);
  await db.insert(schema.organizations).values({
    id: orgId,
    name: unique("Org"),
    type: "band",
    timezone: "Australia/Sydney",
    currencyCode: "AUD",
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
  return { orgId, membershipId };
}

async function seedStudent(
  orgId: string,
  membershipId: string,
  status: "interested" | "active" | "withdrawn" | "archived",
  groupId: string | null = null,
): Promise<{ userId: string; membershipId: string }> {
  const userId = generateId(ID_PREFIXES.user);
  const parentMembershipId = generateId(ID_PREFIXES.membership);
  const householdId = generateId(ID_PREFIXES.household);
  const contactId = generateId(ID_PREFIXES.contact);
  const studentId = generateId(ID_PREFIXES.student);
  const email = `${unique("parent")}@test.local`;
  await db.insert(schema.users).values({ id: userId, email, createdAt: NOW });
  await db.insert(schema.memberships).values({
    id: parentMembershipId,
    organizationId: orgId,
    userId,
    role: "parent",
    status: "active",
    invitedEmail: email,
    acceptedAt: NOW,
    createdAt: NOW,
  });
  await db.insert(schema.households).values({
    id: householdId,
    organizationId: orgId,
    name: unique("Household"),
    createdAt: NOW,
  });
  await db.insert(schema.contacts).values({
    id: contactId,
    organizationId: orgId,
    householdId,
    name: "Parent",
    email,
    userId,
    createdAt: NOW,
  });
  await db.insert(schema.students).values({
    id: studentId,
    organizationId: orgId,
    householdId,
    name: unique("Student"),
    status,
    groupId,
    statusChangedAt: NOW,
    statusChangedByMembershipId: membershipId,
    createdAt: NOW,
  });
  await db.insert(schema.studentContacts).values({
    organizationId: orgId,
    studentId,
    contactId,
    relationship: "parent",
  });
  return { userId, membershipId: parentMembershipId };
}

async function seedEvent(
  orgId: string,
  membershipId: string,
  input: {
    title: string;
    startsAtUtc: number;
    endsAtUtc?: number;
    status: "draft" | "published" | "cancelled" | "completed";
    isOrgWide?: boolean;
    groupId?: string;
  },
): Promise<string> {
  const eventId = generateId(ID_PREFIXES.event);
  await db.insert(schema.events).values({
    id: eventId,
    organizationId: orgId,
    title: input.title,
    startsAtUtc: input.startsAtUtc,
    endsAtUtc: input.endsAtUtc ?? null,
    status: input.status,
    isOrgWide: input.isOrgWide ?? true,
    createdByMembershipId: membershipId,
    createdAt: NOW,
    updatedAt: NOW,
  });
  if (input.groupId) {
    await db.insert(schema.eventGroups).values({
      organizationId: orgId,
      eventId,
      groupId: input.groupId,
    });
  }
  return eventId;
}

async function seedRehearsal(
  orgId: string,
  input: { startsAtUtc: number; status: "scheduled" | "cancelled"; groupId?: string },
): Promise<string> {
  const termId = generateId(ID_PREFIXES.term);
  const seriesId = generateId(ID_PREFIXES.rehearsalSeries);
  const occurrenceId = generateId(ID_PREFIXES.rehearsalOccurrence);
  await db.insert(schema.terms).values({
    id: termId,
    organizationId: orgId,
    name: unique("Term"),
    startDate: "2026-08-01",
    endDate: "2026-12-01",
    createdAt: NOW,
  });
  await db.insert(schema.rehearsalSeries).values({
    id: seriesId,
    organizationId: orgId,
    termId,
    groupId: input.groupId ?? null,
    weekday: 3,
    startTimeLocal: "18:00",
    endTimeLocal: "20:00",
    location: "Band room",
    createdAt: NOW,
  });
  await db.insert(schema.rehearsalOccurrences).values({
    id: occurrenceId,
    organizationId: orgId,
    seriesId,
    localDate: "2026-08-19",
    startsAtUtc: input.startsAtUtc,
    endsAtUtc: input.startsAtUtc + 7_200_000,
    status: input.status,
    createdAt: NOW,
  });
  return occurrenceId;
}

describe("Overview 月历与统计", () => {
  it("staff 看到当月全部状态日程、全部学生口径和账本摘要，并拥有分组与 WIP 视图", async () => {
    const seeded = await seedOrg();
    await seedStudent(seeded.orgId, seeded.membershipId, "active");
    await seedStudent(seeded.orgId, seeded.membershipId, "archived");
    // 分组：active 与 archived，仅 active 进入 staff Overview 左栏
    const activeGroupId = generateId(ID_PREFIXES.group);
    const archivedGroupId = generateId(ID_PREFIXES.group);
    await db.insert(schema.groups).values([
      { id: activeGroupId, organizationId: seeded.orgId, name: "Active Group", createdAt: NOW },
      {
        id: archivedGroupId,
        organizationId: seeded.orgId,
        name: "Archived Group",
        status: "archived",
        createdAt: NOW,
      },
    ]);
    await seedEvent(seeded.orgId, seeded.membershipId, {
      title: "Draft concert",
      startsAtUtc: Date.parse("2026-08-05T08:00:00Z"),
      status: "draft",
    });
    await seedEvent(seeded.orgId, seeded.membershipId, {
      title: "Published concert",
      startsAtUtc: Date.parse("2026-08-10T08:00:00Z"),
      status: "published",
    });
    await seedEvent(seeded.orgId, seeded.membershipId, {
      title: "Cross-month camp",
      startsAtUtc: Date.parse("2026-07-30T08:00:00Z"),
      endsAtUtc: Date.parse("2026-08-02T08:00:00Z"),
      status: "completed",
    });
    await seedRehearsal(seeded.orgId, {
      startsAtUtc: Date.parse("2026-08-19T08:00:00Z"),
      status: "cancelled",
    });
    await db.insert(schema.ledgerEntries).values([
      {
        id: generateId(ID_PREFIXES.ledgerEntry),
        organizationId: seeded.orgId,
        direction: "income",
        amountMinor: 100_00,
        occurredOn: "2026-08-01",
        category: "Donation",
        status: "posted",
        createdByMembershipId: seeded.membershipId,
        updatedByMembershipId: seeded.membershipId,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: generateId(ID_PREFIXES.ledgerEntry),
        organizationId: seeded.orgId,
        direction: "expense",
        amountMinor: 20_00,
        occurredOn: "2026-08-02",
        category: "Supplies",
        status: "posted",
        createdByMembershipId: seeded.membershipId,
        updatedByMembershipId: seeded.membershipId,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);

    const data = await getStaffOverviewData(db, seeded.orgId, AUGUST, "Australia/Sydney");
    expect(data.stats).toMatchObject({
      studentCount: 2,
      activeStudentCount: 1,
      eventCount: 3,
      ledgerBalanceMinor: 80_00,
      ledgerMonthNetMinor: 80_00,
      currencyCode: "AUD",
    });
    expect(data.calendarItems.map((item) => [item.kind, item.status, item.title])).toEqual([
      ["event", "completed", "Cross-month camp"],
      ["event", "draft", "Draft concert"],
      ["event", "published", "Published concert"],
      ["rehearsal", "cancelled", "Rehearsal"],
    ]);
    // 左栏分组：仅 active
    expect(data.groups.map((group) => group.name)).toEqual(["Active Group"]);
    expect(data.groups[0]?.status).toBe("active");
    // 右栏 WIP：仅 draft + published，按 startsAtUtc 升序
    expect(data.wipEvents.map((event) => [event.status, event.title])).toEqual([
      ["draft", "Draft concert"],
      ["published", "Published concert"],
    ]);
  });

  it("staff WIP 按时间排序且跨月可见，cancelled/completed 不进入 WIP", async () => {
    const seeded = await seedOrg();
    await seedEvent(seeded.orgId, seeded.membershipId, {
      title: "Later published",
      startsAtUtc: Date.parse("2026-09-01T08:00:00Z"),
      status: "published",
    });
    await seedEvent(seeded.orgId, seeded.membershipId, {
      title: "Earlier draft",
      startsAtUtc: Date.parse("2026-07-01T08:00:00Z"),
      status: "draft",
    });
    await seedEvent(seeded.orgId, seeded.membershipId, {
      title: "Cancelled event",
      startsAtUtc: Date.parse("2026-08-15T08:00:00Z"),
      status: "cancelled",
    });
    // AUGUST 窗口外但仍应在 WIP 中（WIP 不限月）
    const data = await getStaffOverviewData(db, seeded.orgId, AUGUST, "Australia/Sydney");
    expect(data.wipEvents.map((event) => event.title)).toEqual([
      "Earlier draft",
      "Later published",
    ]);
  });

  it("parent 不看到 draft，只看到全组织和自己旧分组范围内的日程", async () => {
    const seeded = await seedOrg();
    const ownGroup = generateId(ID_PREFIXES.group);
    const otherGroup = generateId(ID_PREFIXES.group);
    await db.insert(schema.groups).values([
      { id: ownGroup, organizationId: seeded.orgId, name: unique("Own"), createdAt: NOW },
      { id: otherGroup, organizationId: seeded.orgId, name: unique("Other"), createdAt: NOW },
    ]);
    const parent = await seedStudent(seeded.orgId, seeded.membershipId, "active", ownGroup);
    await seedEvent(seeded.orgId, seeded.membershipId, {
      title: "Whole organization",
      startsAtUtc: Date.parse("2026-08-03T08:00:00Z"),
      status: "published",
    });
    await seedEvent(seeded.orgId, seeded.membershipId, {
      title: "Own legacy audience",
      startsAtUtc: Date.parse("2026-08-04T08:00:00Z"),
      status: "published",
      isOrgWide: false,
      groupId: ownGroup,
    });
    await seedEvent(seeded.orgId, seeded.membershipId, {
      title: "Other legacy audience",
      startsAtUtc: Date.parse("2026-08-05T08:00:00Z"),
      status: "published",
      isOrgWide: false,
      groupId: otherGroup,
    });
    await seedEvent(seeded.orgId, seeded.membershipId, {
      title: "Staff draft",
      startsAtUtc: Date.parse("2026-08-06T08:00:00Z"),
      status: "draft",
    });
    await seedRehearsal(seeded.orgId, {
      startsAtUtc: Date.parse("2026-08-19T08:00:00Z"),
      status: "scheduled",
      groupId: ownGroup,
    });
    await seedRehearsal(seeded.orgId, {
      startsAtUtc: Date.parse("2026-08-20T08:00:00Z"),
      status: "scheduled",
      groupId: otherGroup,
    });

    const data = await getParentOverviewData(
      db,
      seeded.orgId,
      parent.userId,
      AUGUST,
      "Australia/Sydney",
    );
    expect(data.calendarItems.map((item) => item.title)).toEqual([
      "Whole organization",
      "Own legacy audience",
      "Rehearsal",
    ]);
  });
});
