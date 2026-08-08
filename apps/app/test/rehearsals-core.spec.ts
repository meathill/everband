import { env } from "cloudflare:test";
import {
  countAssignments,
  createStudentCore,
  decideSwapCore,
  eligibleHouseholdIds,
  expandSeries,
  RehearsalError,
} from "@everband/core";
import { createDb, schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const db = createDb(env.DB);
const NOW = 1_754_600_000_000;

let seq = 0;
function unique(prefix: string): string {
  seq += 1;
  return `${prefix}-${NOW}-${seq}-${Math.random().toString(36).slice(2, 6)}`;
}

interface Seeded {
  orgId: string;
  membershipId: string;
  groupId: string;
  termId: string;
  householdIds: string[];
}

// 组织 + term（4 周）+ group + 3 个 active 学生（3 个 household）
async function seed(): Promise<Seeded> {
  const orgId = generateId(ID_PREFIXES.organization);
  const membershipId = generateId(ID_PREFIXES.membership);
  const groupId = generateId(ID_PREFIXES.group);
  const termId = generateId(ID_PREFIXES.term);
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
  await db.insert(schema.groups).values({
    id: groupId,
    organizationId: orgId,
    name: unique("G"),
    createdAt: NOW,
  });
  await db.insert(schema.terms).values({
    id: termId,
    organizationId: orgId,
    name: unique("Term"),
    // 周一开始的 4 周 term：2026-10-05 → 2026-11-01（跨 AEDT 切换）
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
  return { orgId, membershipId, groupId, termId, householdIds };
}

async function seedSeries(seeded: Seeded, helpersNeeded = 1): Promise<string> {
  const seriesId = generateId(ID_PREFIXES.rehearsalSeries);
  await db.insert(schema.rehearsalSeries).values({
    id: seriesId,
    organizationId: seeded.orgId,
    termId: seeded.termId,
    groupId: seeded.groupId,
    weekday: 3, // 周三
    startTimeLocal: "17:30",
    endTimeLocal: "19:00",
    helpersNeeded,
    createdAt: NOW,
  });
  return seriesId;
}

describe("expandSeries", () => {
  it("只在 term 范围内生成 occurrence，重复展开幂等", async () => {
    const seeded = await seed();
    const seriesId = await seedSeries(seeded);

    const first = await expandSeries(db, seeded.orgId, seriesId, NOW);
    // 2026-10-07/14/21/28（11-01 是周日，不含）
    expect(first.occurrencesCreated).toBe(4);
    expect(first.assignmentsCreated).toBe(4);

    const second = await expandSeries(db, seeded.orgId, seriesId, NOW + 1000);
    expect(second.occurrencesCreated).toBe(0);
    expect(second.assignmentsCreated).toBe(0);
    expect(await countAssignments(db, seriesId)).toBe(4);
  });

  it("跨 AEDT 切换周的 UTC 时刻正确（本地 17:30 恒定）", async () => {
    const seeded = await seed();
    const seriesId = await seedSeries(seeded);
    await expandSeries(db, seeded.orgId, seriesId, NOW);
    const occurrences = await db
      .select()
      .from(schema.rehearsalOccurrences)
      .where(eq(schema.rehearsalOccurrences.seriesId, seriesId))
      .orderBy(schema.rehearsalOccurrences.localDate);
    // 09-30 前为 AEST(+10)…此 term 从 10-05 开始已是 AEDT(+11)
    const first = occurrences[0];
    expect(first?.localDate).toBe("2026-10-07");
    expect(new Date(first?.startsAtUtc ?? 0).toISOString()).toBe("2026-10-07T06:30:00.000Z");
  });

  it("轮换可预测且不覆盖手工分配", async () => {
    const seeded = await seed();
    const seriesId = await seedSeries(seeded);
    await expandSeries(db, seeded.orgId, seriesId, NOW);

    const occurrences = await db
      .select({ id: schema.rehearsalOccurrences.id })
      .from(schema.rehearsalOccurrences)
      .where(eq(schema.rehearsalOccurrences.seriesId, seriesId))
      .orderBy(schema.rehearsalOccurrences.localDate);
    const sorted = [...seeded.householdIds].sort();

    const assignments = await db
      .select()
      .from(schema.rosterAssignments)
      .where(eq(schema.rosterAssignments.organizationId, seeded.orgId));
    const byOccurrence = new Map(assignments.map((a) => [a.occurrenceId, a]));
    // 第 0/1/2 次分别是排序后第 0/1/2 个 household
    expect(byOccurrence.get(occurrences[0]?.id ?? "")?.householdId).toBe(sorted[0]);
    expect(byOccurrence.get(occurrences[1]?.id ?? "")?.householdId).toBe(sorted[1]);
    expect(byOccurrence.get(occurrences[2]?.id ?? "")?.householdId).toBe(sorted[2]);
    expect(byOccurrence.get(occurrences[3]?.id ?? "")?.householdId).toBe(sorted[0]);

    // 手工替换第一次的 household 后再展开：不被覆盖
    const firstAssignment = byOccurrence.get(occurrences[0]?.id ?? "");
    await db
      .update(schema.rosterAssignments)
      .set({ householdId: sorted[2] ?? "", source: "manual" })
      .where(eq(schema.rosterAssignments.id, firstAssignment?.id ?? ""));
    await expandSeries(db, seeded.orgId, seriesId, NOW + 2000);
    const after = await db
      .select()
      .from(schema.rosterAssignments)
      .where(eq(schema.rosterAssignments.id, firstAssignment?.id ?? ""));
    expect(after[0]?.householdId).toBe(sorted[2]);
    expect(after[0]?.source).toBe("manual");
  });

  it("withdrawn 学生的 household 退出 eligible 集合", async () => {
    const seeded = await seed();
    const students = await db
      .select({ id: schema.students.id, householdId: schema.students.householdId })
      .from(schema.students)
      .where(eq(schema.students.organizationId, seeded.orgId));
    const target = students[0];
    await db
      .update(schema.students)
      .set({ status: "withdrawn" })
      .where(eq(schema.students.id, target?.id ?? ""));
    const eligible = await eligibleHouseholdIds(db, seeded.orgId, seeded.groupId);
    expect(eligible).not.toContain(target?.householdId);
    expect(eligible).toHaveLength(2);
  });
});

describe("decideSwapCore", () => {
  async function seedSwap(seeded: Seeded): Promise<{ swapId: string; assignmentId: string }> {
    const seriesId = await seedSeries(seeded);
    await expandSeries(db, seeded.orgId, seriesId, NOW);
    const assignments = await db
      .select({ id: schema.rosterAssignments.id })
      .from(schema.rosterAssignments)
      .where(eq(schema.rosterAssignments.organizationId, seeded.orgId))
      .limit(1);
    const assignmentId = assignments[0]?.id ?? "";
    const swapId = generateId(ID_PREFIXES.swapRequest);
    await db.insert(schema.swapRequests).values({
      id: swapId,
      organizationId: seeded.orgId,
      assignmentId,
      requestedByMembershipId: seeded.membershipId,
      status: "requested",
      createdAt: NOW,
    });
    return { swapId, assignmentId };
  }

  it("未批准前 roster 不变；批准后替换 household 并标记 swap", async () => {
    const seeded = await seed();
    const { swapId, assignmentId } = await seedSwap(seeded);
    const before = await db
      .select()
      .from(schema.rosterAssignments)
      .where(eq(schema.rosterAssignments.id, assignmentId));
    const replacement = seeded.householdIds.find((id) => id !== before[0]?.householdId) ?? "";

    // 换班请求存在但未决定：roster 原样
    expect(before[0]?.source).toBe("auto");

    await decideSwapCore(
      db,
      seeded.orgId,
      swapId,
      "approved",
      seeded.membershipId,
      replacement,
      NOW,
    );
    const after = await db
      .select()
      .from(schema.rosterAssignments)
      .where(eq(schema.rosterAssignments.id, assignmentId));
    expect(after[0]?.householdId).toBe(replacement);
    expect(after[0]?.source).toBe("swap");
  });

  it("拒绝保留原分配；重复决定被状态机拒绝（幂等）", async () => {
    const seeded = await seed();
    const { swapId, assignmentId } = await seedSwap(seeded);
    const before = await db
      .select({ householdId: schema.rosterAssignments.householdId })
      .from(schema.rosterAssignments)
      .where(eq(schema.rosterAssignments.id, assignmentId));

    await decideSwapCore(db, seeded.orgId, swapId, "declined", seeded.membershipId, undefined, NOW);
    const after = await db
      .select({ householdId: schema.rosterAssignments.householdId })
      .from(schema.rosterAssignments)
      .where(eq(schema.rosterAssignments.id, assignmentId));
    expect(after[0]?.householdId).toBe(before[0]?.householdId);

    // 已 declined 再批准 → 拒绝（不会产生第二次 roster 变更）
    await expect(
      decideSwapCore(
        db,
        seeded.orgId,
        swapId,
        "approved",
        seeded.membershipId,
        seeded.householdIds[0],
        NOW,
      ),
    ).rejects.toThrow(RehearsalError);
  });

  it("跨组织换班决定被拒", async () => {
    const seeded = await seed();
    const other = await seed();
    const { swapId } = await seedSwap(seeded);
    await expect(
      decideSwapCore(
        db,
        other.orgId,
        swapId,
        "approved",
        other.membershipId,
        other.householdIds[0],
        NOW,
      ),
    ).rejects.toThrow(RehearsalError);
  });
});
