// CSV 导入处理核心（PRD §6.2）：apps/tasks 消费者调用；
// 部分成功语义 —— 错误行保留原因，不中断整批，也不允许静默跳过。

import type { Database } from "@everband/db";
import { schema } from "@everband/db";
import { canTransitionStudent, generateId, ID_PREFIXES } from "@everband/domain";
import { type ImportRow, type ListResult, toOffset, validateImportCsv } from "@everband/validation";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { recordAudit } from "./audit.ts";
import { upsertContact } from "./members.ts";

export type ImportOutcome = "created" | "updated" | "skipped" | "failed";

export interface ListImportJobsInput {
  page: number;
  pageSize: number;
}

/** 导入历史固定按时间倒序；id 作为同毫秒任务的稳定兜底排序。 */
export async function listImportJobsCore(
  db: Database,
  orgId: string,
  input: ListImportJobsInput,
): Promise<ListResult<typeof schema.importJobs.$inferSelect>> {
  const where = eq(schema.importJobs.organizationId, orgId);
  const [items, totals] = await Promise.all([
    db
      .select()
      .from(schema.importJobs)
      .where(where)
      .orderBy(desc(schema.importJobs.createdAt), asc(schema.importJobs.id))
      .limit(input.pageSize)
      .offset(toOffset(input.page, input.pageSize)),
    db.select({ value: count() }).from(schema.importJobs).where(where),
  ]);
  return { items, total: totals[0]?.value ?? 0, page: input.page, pageSize: input.pageSize };
}

interface RowResult {
  rowNumber: number;
  outcome: ImportOutcome;
  error?: string;
  studentId?: string;
}

// 领取任务：queued → processing。重投递（processing 中断后重试）也允许领取，
// 行级 UNIQUE(jobId,rowNumber) 保证重复处理不产生重复数据。
async function claimJob(db: Database, jobId: string, now: number) {
  const rows = await db
    .update(schema.importJobs)
    .set({ status: "processing" })
    .where(
      and(
        eq(schema.importJobs.id, jobId),
        inArray(schema.importJobs.status, ["queued", "processing"]),
      ),
    )
    .returning({
      id: schema.importJobs.id,
      organizationId: schema.importJobs.organizationId,
      requestedByMembershipId: schema.importJobs.requestedByMembershipId,
      createdAt: sql<number>`${now}`,
    });
  return rows[0] ?? null;
}

async function processRow(
  db: Database,
  orgId: string,
  row: ImportRow,
  groupsByName: Map<string, string>,
  actorMembershipId: string,
  now: number,
): Promise<Omit<RowResult, "rowNumber">> {
  let groupId: string | null = null;
  if (row.groupName) {
    const found = groupsByName.get(row.groupName.trim().toLowerCase());
    if (!found) {
      return { outcome: "failed", error: `Group "${row.groupName}" does not exist` };
    }
    groupId = found;
  }
  if (row.status === "active" && !groupId) {
    return { outcome: "failed", error: "Active students must have a groupName" };
  }

  const contact = await upsertContact(
    db,
    orgId,
    {
      name: row.contactName,
      email: row.contactEmail,
      relationship: row.relationship,
    },
    now,
  );

  // 与现有数据匹配：规范化邮箱优先，学生姓名辅助（PRD §6.2）——
  // 同 household 下同名学生视为同一人
  const existing = await db
    .select({
      id: schema.students.id,
      status: schema.students.status,
      groupId: schema.students.groupId,
    })
    .from(schema.students)
    .where(
      and(
        eq(schema.students.organizationId, orgId),
        eq(schema.students.householdId, contact.householdId),
        sql`lower(${schema.students.name}) = ${row.studentName.toLowerCase()}`,
      ),
    )
    .limit(1);
  const found = existing[0];

  if (!found) {
    const studentId = generateId(ID_PREFIXES.student);
    await db.batch([
      db.insert(schema.students).values({
        id: studentId,
        organizationId: orgId,
        householdId: contact.householdId,
        name: row.studentName,
        status: row.status,
        groupId,
        statusChangedAt: now,
        statusChangedByMembershipId: actorMembershipId,
        createdAt: now,
      }),
      db
        .insert(schema.studentContacts)
        .values({
          organizationId: orgId,
          studentId,
          contactId: contact.contactId,
          relationship: row.relationship,
        })
        .onConflictDoNothing(),
    ]);
    return { outcome: "created", studentId };
  }

  // 已存在：关系补齐；字段一致则跳过，不一致则更新
  await db
    .insert(schema.studentContacts)
    .values({
      organizationId: orgId,
      studentId: found.id,
      contactId: contact.contactId,
      relationship: row.relationship,
    })
    .onConflictDoNothing();

  const statusChanged = found.status !== row.status;
  const groupChanged = (found.groupId ?? null) !== groupId;
  if (!statusChanged && !groupChanged) {
    return { outcome: "skipped", studentId: found.id };
  }
  if (statusChanged && !canTransitionStudent(found.status, row.status)) {
    return {
      outcome: "failed",
      error: `Cannot change status from ${found.status} to ${row.status}`,
      studentId: found.id,
    };
  }
  await db
    .update(schema.students)
    .set({
      status: row.status,
      groupId,
      statusChangedAt: now,
      statusChangedByMembershipId: actorMembershipId,
    })
    .where(and(eq(schema.students.id, found.id), eq(schema.students.organizationId, orgId)));
  return { outcome: "updated", studentId: found.id };
}

export async function processImportJob(
  db: Database,
  jobId: string,
  csvText: string,
  now: number,
): Promise<{ processed: boolean }> {
  const job = await claimJob(db, jobId, now);
  if (!job) {
    return { processed: false };
  }

  const validation = validateImportCsv(csvText);
  if (validation.headerError) {
    await db
      .update(schema.importJobs)
      .set({ status: "failed", error: validation.headerError, finishedAt: now })
      .where(eq(schema.importJobs.id, jobId));
    return { processed: true };
  }

  // 只认 active 分组：归档分组不该再接收新学生（与选择器语义一致），
  // 导入时按"不存在"处理，行级失败并给出原因
  const groups = await db
    .select({ id: schema.groups.id, name: schema.groups.name })
    .from(schema.groups)
    .where(
      and(
        eq(schema.groups.organizationId, job.organizationId),
        eq(schema.groups.status, "active" as const),
      ),
    );
  const groupsByName = new Map(groups.map((group) => [group.name.trim().toLowerCase(), group.id]));

  const counts = { created: 0, updated: 0, skipped: 0, failed: 0 };
  for (const row of validation.rows) {
    let result: Omit<RowResult, "rowNumber">;
    if (!row.ok || !row.data) {
      result = { outcome: "failed", error: row.errors.join("; ") };
    } else {
      try {
        result = await processRow(
          db,
          job.organizationId,
          row.data,
          groupsByName,
          job.requestedByMembershipId,
          now,
        );
      } catch (cause) {
        result = {
          outcome: "failed",
          error: cause instanceof Error ? cause.message : "Unexpected error",
        };
      }
    }
    counts[result.outcome] += 1;
    // 行级幂等：重复处理覆盖同一行记录，不产生第二条
    await db
      .insert(schema.importJobRows)
      .values({
        id: generateId(ID_PREFIXES.importJobRow),
        jobId,
        organizationId: job.organizationId,
        rowNumber: row.rowNumber,
        outcome: result.outcome,
        error: result.error ?? null,
        resultStudentId: result.studentId ?? null,
      })
      .onConflictDoUpdate({
        target: [schema.importJobRows.jobId, schema.importJobRows.rowNumber],
        set: {
          outcome: result.outcome,
          error: result.error ?? null,
          resultStudentId: result.studentId ?? null,
        },
      });
  }

  await db
    .update(schema.importJobs)
    .set({
      status: "succeeded",
      totalRows: validation.rows.length,
      createdCount: counts.created,
      updatedCount: counts.updated,
      skippedCount: counts.skipped,
      failedCount: counts.failed,
      finishedAt: now,
    })
    .where(eq(schema.importJobs.id, jobId));

  await recordAudit(db, {
    organizationId: job.organizationId,
    actorMembershipId: job.requestedByMembershipId,
    action: "import.completed",
    objectType: "import_job",
    objectId: jobId,
    summary: { totalRows: validation.rows.length, ...counts },
  });
  return { processed: true };
}
