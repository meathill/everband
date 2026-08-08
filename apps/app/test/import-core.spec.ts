import { env } from "cloudflare:test";
import { processImportJob } from "@everband/core";
import { createDb, schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
import { CSV_HEADERS } from "@everband/validation";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const db = createDb(env.DB);
const NOW = 1_754_200_000_000;

let seq = 0;
function unique(prefix: string): string {
  seq += 1;
  return `${prefix}-${NOW}-${seq}-${Math.random().toString(36).slice(2, 6)}`;
}

async function seedOrgWithGroup(): Promise<{
  orgId: string;
  membershipId: string;
  groupName: string;
}> {
  const orgId = generateId(ID_PREFIXES.organization);
  const membershipId = generateId(ID_PREFIXES.membership);
  const groupName = unique("Band");
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
    id: generateId(ID_PREFIXES.group),
    organizationId: orgId,
    name: groupName,
    createdAt: NOW,
  });
  return { orgId, membershipId, groupName };
}

async function seedJob(orgId: string, membershipId: string): Promise<string> {
  const jobId = generateId(ID_PREFIXES.importJob);
  await db.insert(schema.importJobs).values({
    id: jobId,
    organizationId: orgId,
    r2Key: `org/${orgId}/import/${jobId}.csv`,
    dedupKey: unique("dedup"),
    status: "queued",
    requestedByMembershipId: membershipId,
    createdAt: NOW,
  });
  return jobId;
}

const header = CSV_HEADERS.join(",");

describe("processImportJob", () => {
  it("部分成功：合法行导入，错误行保留原因，计数正确", async () => {
    const { orgId, membershipId, groupName } = await seedOrgWithGroup();
    const jobId = await seedJob(orgId, membershipId);
    const email = `${unique("p")}@test.local`;
    const csv = [
      header,
      `Kid A,Parent,${email},parent,${groupName},active`,
      `Kid B,Parent,${email},parent,,interested`,
      `Kid C,Parent,not-an-email,parent,${groupName},active`,
      `Kid D,Parent,${email},parent,No Such Group,active`,
    ].join("\n");

    await processImportJob(db, jobId, csv, NOW);

    const jobs = await db.select().from(schema.importJobs).where(eq(schema.importJobs.id, jobId));
    const job = jobs[0];
    expect(job?.status).toBe("succeeded");
    expect(job?.totalRows).toBe(4);
    expect(job?.createdCount).toBe(2);
    expect(job?.failedCount).toBe(2);

    const rows = await db
      .select()
      .from(schema.importJobRows)
      .where(eq(schema.importJobRows.jobId, jobId));
    expect(rows).toHaveLength(4);
    expect(rows.find((row) => row.rowNumber === 3)?.error).toContain("email");
    expect(rows.find((row) => row.rowNumber === 4)?.error).toContain("No Such Group");

    // 同一联系人两个孩子：共享 household
    const students = await db
      .select()
      .from(schema.students)
      .where(eq(schema.students.organizationId, orgId));
    expect(students).toHaveLength(2);
    expect(new Set(students.map((s) => s.householdId)).size).toBe(1);
  });

  it("重复处理同一任务不产生重复学生（行级幂等）", async () => {
    const { orgId, membershipId, groupName } = await seedOrgWithGroup();
    const jobId = await seedJob(orgId, membershipId);
    const email = `${unique("re")}@test.local`;
    const csv = [header, `Kid,Parent,${email},parent,${groupName},active`].join("\n");

    await processImportJob(db, jobId, csv, NOW);
    // 模拟消费者中途崩溃后消息重投：任务回到 processing 再次处理
    await db
      .update(schema.importJobs)
      .set({ status: "processing" })
      .where(eq(schema.importJobs.id, jobId));
    await processImportJob(db, jobId, csv, NOW + 1000);

    const students = await db
      .select()
      .from(schema.students)
      .where(eq(schema.students.organizationId, orgId));
    expect(students).toHaveLength(1);

    const rows = await db
      .select()
      .from(schema.importJobRows)
      .where(eq(schema.importJobRows.jobId, jobId));
    expect(rows).toHaveLength(1);
    // 第二次处理时学生已存在且字段一致 → skipped
    expect(rows[0]?.outcome).toBe("skipped");
  });

  it("已完成的任务不再被领取", async () => {
    const { orgId, membershipId, groupName } = await seedOrgWithGroup();
    const jobId = await seedJob(orgId, membershipId);
    const csv = [header, `Kid,Parent,${unique("done")}@test.local,parent,${groupName},active`].join(
      "\n",
    );
    await processImportJob(db, jobId, csv, NOW);
    const second = await processImportJob(db, jobId, csv, NOW + 1);
    expect(second.processed).toBe(false);
  });

  it("再导入同文件时已有学生 skipped，改了 group 的行 updated", async () => {
    const { orgId, membershipId, groupName } = await seedOrgWithGroup();
    const email = `${unique("up")}@test.local`;

    const firstJob = await seedJob(orgId, membershipId);
    await processImportJob(
      db,
      firstJob,
      [header, `Kid,Parent,${email},parent,${groupName},active`].join("\n"),
      NOW,
    );

    // 新 group + 第二次导入：同学生改分组 → updated
    const newGroup = unique("New");
    await db.insert(schema.groups).values({
      id: generateId(ID_PREFIXES.group),
      organizationId: orgId,
      name: newGroup,
      createdAt: NOW,
    });
    const secondJob = await seedJob(orgId, membershipId);
    await processImportJob(
      db,
      secondJob,
      [header, `Kid,Parent,${email},parent,${newGroup},active`].join("\n"),
      NOW + 1000,
    );

    const jobs = await db
      .select()
      .from(schema.importJobs)
      .where(eq(schema.importJobs.id, secondJob));
    expect(jobs[0]?.updatedCount).toBe(1);
    expect(jobs[0]?.createdCount).toBe(0);
  });
});
