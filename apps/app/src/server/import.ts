import { env } from "cloudflare:workers";
import { listImportJobsCore } from "@everband/core";
import { schema } from "@everband/db";
import { generateId, ID_PREFIXES, sha256Hex } from "@everband/domain";
import { importJobsPageSchema, validateImportCsv } from "@everband/validation";
import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./context.ts";
import { requireMembership, STAFF_ROLES } from "./guards.ts";

const csvPayloadSchema = z.object({
  orgId: z.string().min(1),
  // MVP：CSV 文本随请求上传（几千行以内）；更大文件后续走分片上传
  csvText: z.string().min(1).max(2_000_000),
});

const jobIdSchema = z.object({
  orgId: z.string().min(1),
  jobId: z.string().min(1),
});

// 干跑校验：预览错误行与重复行，不写任何数据（PRD §6.2）
export const previewImport = createServerFn({ method: "POST" })
  .validator(csvPayloadSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    await requireMembership(db, data.orgId, STAFF_ROLES);
    const result = validateImportCsv(data.csvText);
    const validCount = result.rows.filter((row) => row.ok).length;
    return {
      headerError: result.headerError ?? null,
      totalRows: result.rows.length,
      validCount,
      invalidRows: result.rows
        .filter((row) => !row.ok)
        .map((row) => ({ rowNumber: row.rowNumber, errors: row.errors })),
    };
  });

// 确认导入：存 R2 → 建任务（dedupKey 幂等）→ 入队
export const confirmImport = createServerFn({ method: "POST" })
  .validator(csvPayloadSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const now = Date.now();

    const dedupKey = `${data.orgId}:${await sha256Hex(data.csvText)}`;
    const existing = await db
      .select({ id: schema.importJobs.id })
      .from(schema.importJobs)
      .where(eq(schema.importJobs.dedupKey, dedupKey))
      .limit(1);
    const found = existing[0];
    if (found) {
      // 同一文件重复确认：返回已有任务，不重复导入
      return { ok: true as const, jobId: found.id, deduplicated: true };
    }

    const jobId = generateId(ID_PREFIXES.importJob);
    const r2Key = `org/${data.orgId}/import/${jobId}.csv`;
    await env.FILES.put(r2Key, data.csvText);
    await db.insert(schema.importJobs).values({
      id: jobId,
      organizationId: data.orgId,
      r2Key,
      dedupKey,
      status: "queued",
      requestedByMembershipId: ctx.membershipId,
      createdAt: now,
    });
    await env.IMPORT_QUEUE.send({ importJobId: jobId, r2Key });
    return { ok: true as const, jobId, deduplicated: false };
  });

export const listImportJobs = createServerFn({ method: "GET" })
  .validator(importJobsPageSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    await requireMembership(db, data.orgId, STAFF_ROLES);
    return listImportJobsCore(db, data.orgId, { page: data.page, pageSize: data.pageSize });
  });

export const getImportJob = createServerFn({ method: "GET" })
  .validator(jobIdSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    await requireMembership(db, data.orgId, STAFF_ROLES);
    const jobs = await db
      .select()
      .from(schema.importJobs)
      .where(eq(schema.importJobs.id, data.jobId))
      .limit(1);
    const job = jobs[0];
    if (!job || job.organizationId !== data.orgId) {
      throw new Error("Import job not found");
    }
    const failedRows = await db
      .select({
        rowNumber: schema.importJobRows.rowNumber,
        error: schema.importJobRows.error,
      })
      .from(schema.importJobRows)
      .where(
        and(eq(schema.importJobRows.jobId, data.jobId), eq(schema.importJobRows.outcome, "failed")),
      )
      .orderBy(schema.importJobRows.rowNumber);
    return { job, failedRows };
  });
