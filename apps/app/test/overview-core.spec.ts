import { env } from "cloudflare:test";
import { getStaffOverviewData } from "@everband/core";
import { createDb, schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
import { describe, expect, it } from "vitest";

const db = createDb(env.DB);
// 与其他 spec 错开的独立时间基准（测试库不清空，靠唯一数据隔离）
const NOW = 1_754_900_000_000;

let seq = 0;
function unique(prefix: string): string {
  seq += 1;
  return `${prefix}-${NOW}-${seq}-${Math.random().toString(36).slice(2, 6)}`;
}

async function seedOrg(): Promise<{ orgId: string; membershipId: string }> {
  const orgId = generateId(ID_PREFIXES.organization);
  const membershipId = generateId(ID_PREFIXES.membership);
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
    invitedEmail: `${unique("o")}@test.local`,
    createdAt: NOW,
  });
  return { orgId, membershipId };
}

async function seedEvent(
  orgId: string,
  membershipId: string,
  input: { title: string; startsAtUtc: number; status: "draft" | "published" | "cancelled" },
): Promise<string> {
  const id = generateId(ID_PREFIXES.event);
  await db.insert(schema.events).values({
    id,
    organizationId: orgId,
    title: input.title,
    startsAtUtc: input.startsAtUtc,
    status: input.status,
    createdByMembershipId: membershipId,
    createdAt: NOW,
    updatedAt: NOW,
  });
  return id;
}

// 换班请求依赖链：term → series → occurrence → household → assignment → swap
async function seedSwap(
  orgId: string,
  membershipId: string,
  input: {
    status: "requested" | "approved";
    householdName: string;
    localDate: string;
    createdAt: number;
  },
): Promise<string> {
  const termId = generateId(ID_PREFIXES.term);
  await db.insert(schema.terms).values({
    id: termId,
    organizationId: orgId,
    name: unique("Term"),
    startDate: "2026-08-01",
    endDate: "2026-12-01",
    createdAt: NOW,
  });
  const seriesId = generateId(ID_PREFIXES.rehearsalSeries);
  await db.insert(schema.rehearsalSeries).values({
    id: seriesId,
    organizationId: orgId,
    termId,
    weekday: 3,
    startTimeLocal: "18:00",
    endTimeLocal: "20:00",
    createdAt: NOW,
  });
  const occurrenceId = generateId(ID_PREFIXES.rehearsalOccurrence);
  await db.insert(schema.rehearsalOccurrences).values({
    id: occurrenceId,
    organizationId: orgId,
    seriesId,
    localDate: input.localDate,
    startsAtUtc: NOW,
    endsAtUtc: NOW + 7_200_000,
    status: "scheduled",
    createdAt: NOW,
  });
  const householdId = generateId(ID_PREFIXES.household);
  await db.insert(schema.households).values({
    id: householdId,
    organizationId: orgId,
    name: input.householdName,
    createdAt: NOW,
  });
  const assignmentId = generateId(ID_PREFIXES.rosterAssignment);
  await db.insert(schema.rosterAssignments).values({
    id: assignmentId,
    organizationId: orgId,
    occurrenceId,
    householdId,
    source: "auto",
    createdAt: NOW,
  });
  const swapId = generateId(ID_PREFIXES.swapRequest);
  await db.insert(schema.swapRequests).values({
    id: swapId,
    organizationId: orgId,
    assignmentId,
    requestedByMembershipId: membershipId,
    status: input.status,
    createdAt: input.createdAt,
  });
  return swapId;
}

describe("getStaffOverviewData（staff Overview 聚合）", () => {
  it("近期活动只含未来的 published，按开始时间升序", async () => {
    const { orgId, membershipId } = await seedOrg();
    await seedEvent(orgId, membershipId, {
      title: "Past concert",
      startsAtUtc: NOW - 86_400_000,
      status: "published",
    });
    await seedEvent(orgId, membershipId, {
      title: "Future draft",
      startsAtUtc: NOW + 86_400_000,
      status: "draft",
    });
    await seedEvent(orgId, membershipId, {
      title: "Future cancelled",
      startsAtUtc: NOW + 86_400_000,
      status: "cancelled",
    });
    await seedEvent(orgId, membershipId, {
      title: "Later",
      startsAtUtc: NOW + 172_800_000,
      status: "published",
    });
    await seedEvent(orgId, membershipId, {
      title: "Sooner",
      startsAtUtc: NOW + 3_600_000,
      status: "published",
    });

    const data = await getStaffOverviewData(db, orgId, NOW);
    expect(data.upcomingEvents.map((e) => e.title)).toEqual(["Sooner", "Later"]);
  });

  it("近期活动最多返回 5 条", async () => {
    const { orgId, membershipId } = await seedOrg();
    for (let i = 1; i <= 7; i += 1) {
      await seedEvent(orgId, membershipId, {
        title: `Event ${i}`,
        startsAtUtc: NOW + i * 3_600_000,
        status: "published",
      });
    }
    const data = await getStaffOverviewData(db, orgId, NOW);
    expect(data.upcomingEvents).toHaveLength(5);
    expect(data.upcomingEvents[0].title).toBe("Event 1");
  });

  it("换班只含 requested，join 出 household 名与排练日期，count 正确", async () => {
    const { orgId, membershipId } = await seedOrg();
    await seedSwap(orgId, membershipId, {
      status: "requested",
      householdName: "The Smiths",
      localDate: "2026-09-02",
      createdAt: NOW - 2000,
    });
    await seedSwap(orgId, membershipId, {
      status: "approved",
      householdName: "The Approved",
      localDate: "2026-09-09",
      createdAt: NOW - 1000,
    });

    const data = await getStaffOverviewData(db, orgId, NOW);
    expect(data.pendingSwaps).toHaveLength(1);
    expect(data.pendingSwaps[0].householdName).toBe("The Smiths");
    expect(data.pendingSwaps[0].occurrenceDate).toBe("2026-09-02");
    expect(data.pendingSwapCount).toBe(1);
  });

  it("导入任务与邮件发送按创建时间倒序，邮件状态原样返回不折叠（PRD §10.2）", async () => {
    const { orgId, membershipId } = await seedOrg();
    const sendStatuses = ["queued", "processing", "succeeded", "partial", "failed"] as const;
    for (const [index, status] of sendStatuses.entries()) {
      await db.insert(schema.emailSends).values({
        id: generateId(ID_PREFIXES.emailSend),
        organizationId: orgId,
        kind: "event-update",
        subject: `Send ${status}`,
        body: "B",
        objectType: "event_update",
        objectId: unique("upd"),
        requestedByMembershipId: membershipId,
        dedupKey: unique("dk"),
        status,
        createdAt: NOW + index * 1000,
      });
    }
    for (const [index, status] of (["succeeded", "failed"] as const).entries()) {
      await db.insert(schema.importJobs).values({
        id: generateId(ID_PREFIXES.importJob),
        organizationId: orgId,
        r2Key: unique("r2"),
        dedupKey: unique("dk"),
        status,
        totalRows: 10,
        requestedByMembershipId: membershipId,
        createdAt: NOW + index * 1000,
      });
    }

    const data = await getStaffOverviewData(db, orgId, NOW);
    expect(data.recentEmailSends.map((s) => s.status)).toEqual([
      "failed",
      "partial",
      "succeeded",
      "processing",
      "queued",
    ]);
    expect(data.recentImportJobs.map((j) => j.status)).toEqual(["failed", "succeeded"]);
  });

  it("组织隔离：不返回其他组织的数据", async () => {
    const a = await seedOrg();
    const b = await seedOrg();
    await seedEvent(b.orgId, b.membershipId, {
      title: "Other org event",
      startsAtUtc: NOW + 3_600_000,
      status: "published",
    });
    await seedSwap(b.orgId, b.membershipId, {
      status: "requested",
      householdName: "Other org household",
      localDate: "2026-09-16",
      createdAt: NOW,
    });

    const data = await getStaffOverviewData(db, a.orgId, NOW);
    expect(data.upcomingEvents).toHaveLength(0);
    expect(data.pendingSwaps).toHaveLength(0);
    expect(data.pendingSwapCount).toBe(0);
    expect(data.recentImportJobs).toHaveLength(0);
    expect(data.recentEmailSends).toHaveLength(0);
  });
});
