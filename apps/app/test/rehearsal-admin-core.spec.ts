import { env } from "cloudflare:test";
import {
  cancelOccurrenceCore,
  cancelSwapRequestCore,
  createStudentCore,
  endRehearsalSeriesCore,
  expandSeries,
  listRehearsalSeriesCore,
} from "@everband/core";
import { createDb, schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const db = createDb(env.DB);
const NOW = 1_754_600_000_000;
// term 是 2026-10-05 → 2026-11-01 的周三：10-07 / 10-14 / 10-21 / 10-28。
// 取 10-15 当"现在"，前两场是过去，后两场是未来。
const MID_TERM = Date.parse("2026-10-15T00:00:00Z");
const AFTER_TERM = Date.parse("2027-01-01T00:00:00Z");

let seq = 0;
function unique(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}-${Math.random().toString(36).slice(2, 6)}`;
}

interface Seeded {
  orgId: string;
  membershipId: string;
  groupId: string;
  termId: string;
  termName: string;
  groupName: string;
  householdIds: string[];
}

// 组织 + 4 周 term + group + 3 个 active 学生（3 个 household）
async function seed(): Promise<Seeded> {
  const orgId = generateId(ID_PREFIXES.organization);
  const membershipId = generateId(ID_PREFIXES.membership);
  const groupId = generateId(ID_PREFIXES.group);
  const termId = generateId(ID_PREFIXES.term);
  const groupName = unique("G");
  const termName = unique("Term");
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
  await db
    .insert(schema.groups)
    .values({ id: groupId, organizationId: orgId, name: groupName, createdAt: NOW });
  await db.insert(schema.terms).values({
    id: termId,
    organizationId: orgId,
    name: termName,
    startDate: "2026-10-05",
    endDate: "2026-11-01",
    createdAt: NOW,
  });
  const householdIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const result = await createStudentCore(
      db,
      orgId,
      {
        name: `Kid ${i}`,
        status: "active",
        groupId,
        contact: { name: `P${i}`, email: `${unique("p")}@test.local`, relationship: "parent" },
      },
      membershipId,
      NOW,
    );
    householdIds.push(result.householdId);
  }
  return { orgId, membershipId, groupId, termId, termName, groupName, householdIds };
}

// 建 series 并展开出 4 场
async function seedExpandedSeries(seeded: Seeded): Promise<string> {
  const seriesId = generateId(ID_PREFIXES.rehearsalSeries);
  await db.insert(schema.rehearsalSeries).values({
    id: seriesId,
    organizationId: seeded.orgId,
    termId: seeded.termId,
    groupId: seeded.groupId,
    weekday: 3,
    startTimeLocal: "17:30",
    endTimeLocal: "19:00",
    helpersNeeded: 1,
    createdAt: NOW,
  });
  await expandSeries(db, seeded.orgId, seriesId, NOW);
  return seriesId;
}

async function occurrencesOf(seriesId: string) {
  return db
    .select({
      id: schema.rehearsalOccurrences.id,
      localDate: schema.rehearsalOccurrences.localDate,
      status: schema.rehearsalOccurrences.status,
    })
    .from(schema.rehearsalOccurrences)
    .where(eq(schema.rehearsalOccurrences.seriesId, seriesId))
    .orderBy(schema.rehearsalOccurrences.localDate);
}

async function auditCount(orgId: string, action: string, objectId: string): Promise<number> {
  const rows = await db
    .select({ id: schema.auditEntries.id })
    .from(schema.auditEntries)
    .where(
      and(
        eq(schema.auditEntries.organizationId, orgId),
        eq(schema.auditEntries.action, action),
        eq(schema.auditEntries.objectId, objectId),
      ),
    );
  return rows.length;
}

describe("endRehearsalSeriesCore", () => {
  it("只取消未来仍排着的场次，过去与已取消的不动", async () => {
    const seeded = await seed();
    const seriesId = await seedExpandedSeries(seeded);
    const before = await occurrencesOf(seriesId);
    expect(before.map((row) => row.localDate)).toEqual([
      "2026-10-07",
      "2026-10-14",
      "2026-10-21",
      "2026-10-28",
    ]);
    // 10-21 先单独取消：结束 series 时不应被重复计数
    await cancelOccurrenceCore(db, seeded.orgId, before[2]?.id ?? "", seeded.membershipId);

    const result = await endRehearsalSeriesCore(
      db,
      seeded.orgId,
      seriesId,
      seeded.membershipId,
      MID_TERM,
    );
    expect(result).toEqual({ ok: true, cancelledCount: 1 });

    const after = await occurrencesOf(seriesId);
    expect(after.map((row) => row.status)).toEqual([
      "scheduled",
      "scheduled",
      "cancelled",
      "cancelled",
    ]);
    expect(await auditCount(seeded.orgId, "rehearsal_series.ended", seriesId)).toBe(1);

    const series = await db
      .select({ isEnabled: schema.rehearsalSeries.isEnabled })
      .from(schema.rehearsalSeries)
      .where(eq(schema.rehearsalSeries.id, seriesId));
    expect(series[0]?.isEnabled).toBe(false);
  });

  it("重复结束是幂等的：不再取消场次，也不重复记 audit", async () => {
    const seeded = await seed();
    const seriesId = await seedExpandedSeries(seeded);
    await endRehearsalSeriesCore(db, seeded.orgId, seriesId, seeded.membershipId, MID_TERM);
    const second = await endRehearsalSeriesCore(
      db,
      seeded.orgId,
      seriesId,
      seeded.membershipId,
      MID_TERM,
    );
    expect(second).toEqual({ ok: true, cancelledCount: 0 });
    expect(await auditCount(seeded.orgId, "rehearsal_series.ended", seriesId)).toBe(1);
  });

  it("已结束的 series 不会被重新展开回来", async () => {
    const seeded = await seed();
    const seriesId = await seedExpandedSeries(seeded);
    await endRehearsalSeriesCore(db, seeded.orgId, seriesId, seeded.membershipId, MID_TERM);
    const again = await expandSeries(db, seeded.orgId, seriesId, MID_TERM);
    expect(again).toEqual({ occurrencesCreated: 0, assignmentsCreated: 0 });
    const after = await occurrencesOf(seriesId);
    expect(after.filter((row) => row.status === "cancelled")).toHaveLength(2);
  });

  it("跨组织与不存在的 series 被拒", async () => {
    const seeded = await seed();
    const other = await seed();
    const seriesId = await seedExpandedSeries(seeded);
    const crossOrg = await endRehearsalSeriesCore(
      db,
      other.orgId,
      seriesId,
      other.membershipId,
      MID_TERM,
    );
    expect(crossOrg).toEqual({ ok: false, error: "Rehearsal series not found." });
  });
});

describe("cancelOccurrenceCore", () => {
  it("scheduled → cancelled 并记 audit", async () => {
    const seeded = await seed();
    const seriesId = await seedExpandedSeries(seeded);
    const target = (await occurrencesOf(seriesId))[3];
    const result = await cancelOccurrenceCore(
      db,
      seeded.orgId,
      target?.id ?? "",
      seeded.membershipId,
    );
    expect(result).toEqual({ ok: true, changed: true });
    const after = await occurrencesOf(seriesId);
    expect(after[3]?.status).toBe("cancelled");
    expect(await auditCount(seeded.orgId, "rehearsal_occurrence.cancelled", target?.id ?? "")).toBe(
      1,
    );
  });

  it("重复取消返回 changed=false，不重复记 audit", async () => {
    const seeded = await seed();
    const seriesId = await seedExpandedSeries(seeded);
    const target = (await occurrencesOf(seriesId))[0];
    await cancelOccurrenceCore(db, seeded.orgId, target?.id ?? "", seeded.membershipId);
    const second = await cancelOccurrenceCore(
      db,
      seeded.orgId,
      target?.id ?? "",
      seeded.membershipId,
    );
    expect(second).toEqual({ ok: true, changed: false });
    expect(await auditCount(seeded.orgId, "rehearsal_occurrence.cancelled", target?.id ?? "")).toBe(
      1,
    );
  });

  it("不存在或跨组织的 occurrence 报错", async () => {
    const seeded = await seed();
    const other = await seed();
    const seriesId = await seedExpandedSeries(seeded);
    const target = (await occurrencesOf(seriesId))[0];
    expect(
      await cancelOccurrenceCore(db, seeded.orgId, "occ_missing", seeded.membershipId),
    ).toEqual({ ok: false, error: "Rehearsal not found." });
    expect(
      await cancelOccurrenceCore(db, other.orgId, target?.id ?? "", other.membershipId),
    ).toEqual({ ok: false, error: "Rehearsal not found." });
  });
});

describe("cancelSwapRequestCore", () => {
  async function seedSwap(
    seeded: Seeded,
    requestedByMembershipId: string,
    status: "requested" | "declined" = "requested",
  ): Promise<string> {
    const seriesId = await seedExpandedSeries(seeded);
    const assignments = await db
      .select({ id: schema.rosterAssignments.id })
      .from(schema.rosterAssignments)
      .innerJoin(
        schema.rehearsalOccurrences,
        eq(schema.rehearsalOccurrences.id, schema.rosterAssignments.occurrenceId),
      )
      .where(eq(schema.rehearsalOccurrences.seriesId, seriesId))
      .limit(1);
    const swapId = generateId(ID_PREFIXES.swapRequest);
    await db.insert(schema.swapRequests).values({
      id: swapId,
      organizationId: seeded.orgId,
      assignmentId: assignments[0]?.id ?? "",
      requestedByMembershipId,
      status,
      createdAt: NOW,
    });
    return swapId;
  }

  async function statusOf(swapId: string): Promise<string | undefined> {
    const rows = await db
      .select({ status: schema.swapRequests.status })
      .from(schema.swapRequests)
      .where(eq(schema.swapRequests.id, swapId));
    return rows[0]?.status;
  }

  it("申请人本人可以撤回 pending 申请", async () => {
    const seeded = await seed();
    const swapId = await seedSwap(seeded, seeded.membershipId);
    const result = await cancelSwapRequestCore(
      db,
      seeded.orgId,
      swapId,
      seeded.membershipId,
      MID_TERM,
    );
    expect(result).toEqual({ ok: true });
    expect(await statusOf(swapId)).toBe("cancelled");
    expect(await auditCount(seeded.orgId, "swap.cancelled", swapId)).toBe(1);
  });

  it("已决定的申请不能再撤回", async () => {
    const seeded = await seed();
    const swapId = await seedSwap(seeded, seeded.membershipId, "declined");
    const result = await cancelSwapRequestCore(
      db,
      seeded.orgId,
      swapId,
      seeded.membershipId,
      MID_TERM,
    );
    expect(result).toEqual({ ok: false, error: "This request was already declined." });
    expect(await statusOf(swapId)).toBe("declined");
  });

  it("不是申请人本人则拒绝", async () => {
    const seeded = await seed();
    const other = await seed();
    const swapId = await seedSwap(seeded, seeded.membershipId);
    const result = await cancelSwapRequestCore(
      db,
      seeded.orgId,
      swapId,
      other.membershipId,
      MID_TERM,
    );
    expect(result).toEqual({ ok: false, error: "You can only cancel your own swap request." });
    expect(await statusOf(swapId)).toBe("requested");
  });
});

describe("listRehearsalSeriesCore", () => {
  it("带出 group/term 名与未来场次数，term 未跑完即 active", async () => {
    const seeded = await seed();
    await seedExpandedSeries(seeded);
    const rows = await listRehearsalSeriesCore(db, seeded.orgId, {}, MID_TERM);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.groupName).toBe(seeded.groupName);
    expect(rows[0]?.termName).toBe(seeded.termName);
    // 10-21 与 10-28 还没到
    expect(rows[0]?.upcomingCount).toBe(2);
    expect(rows[0]?.status).toBe("active");
  });

  it("term 跑完后（未来无 scheduled 场次）推导为 ended", async () => {
    const seeded = await seed();
    await seedExpandedSeries(seeded);
    const rows = await listRehearsalSeriesCore(db, seeded.orgId, {}, AFTER_TERM);
    expect(rows[0]?.upcomingCount).toBe(0);
    expect(rows[0]?.status).toBe("ended");
  });

  it("显式结束后立即变成 ended", async () => {
    const seeded = await seed();
    const seriesId = await seedExpandedSeries(seeded);
    await endRehearsalSeriesCore(db, seeded.orgId, seriesId, seeded.membershipId, MID_TERM);
    const rows = await listRehearsalSeriesCore(db, seeded.orgId, {}, MID_TERM);
    expect(rows[0]?.upcomingCount).toBe(0);
    expect(rows[0]?.status).toBe("ended");
  });

  it("group 筛选与组织隔离生效", async () => {
    const seeded = await seed();
    const other = await seed();
    await seedExpandedSeries(seeded);
    expect(
      await listRehearsalSeriesCore(db, seeded.orgId, { groupId: seeded.groupId }, MID_TERM),
    ).toHaveLength(1);
    expect(
      await listRehearsalSeriesCore(db, seeded.orgId, { groupId: other.groupId }, MID_TERM),
    ).toHaveLength(0);
    expect(await listRehearsalSeriesCore(db, other.orgId, {}, MID_TERM)).toHaveLength(0);
  });
});
