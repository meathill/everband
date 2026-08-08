import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { organizations } from "./org.ts";

// 异步任务（PRD §6.2/§9）：CSV 导入任务与行级结果。
// 幂等三层：dedupKey UNIQUE（任务级）、UNIQUE(jobId,rowNumber)（行级）、
// 消费前状态检查（执行级）。

export const importJobs = sqliteTable(
  "import_jobs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    // 原始文件在 R2 的 key（org/{orgId}/import/{jobId}.csv）
    r2Key: text("r2_key").notNull(),
    // 同一组织同一文件内容只建一个任务（确认重试不重复导入）
    dedupKey: text("dedup_key").notNull(),
    status: text("status", {
      enum: ["queued", "processing", "succeeded", "failed"],
    }).notNull(),
    totalRows: integer("total_rows").notNull().default(0),
    createdCount: integer("created_count").notNull().default(0),
    updatedCount: integer("updated_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    requestedByMembershipId: text("requested_by_membership_id").notNull(),
    error: text("error"),
    createdAt: integer("created_at").notNull(),
    finishedAt: integer("finished_at"),
  },
  (table) => [
    uniqueIndex("uq_import_jobs_dedup").on(table.dedupKey),
    index("idx_import_jobs_org_created").on(table.organizationId, table.createdAt),
  ],
);

export const importJobRows = sqliteTable(
  "import_job_rows",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => importJobs.id),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    rowNumber: integer("row_number").notNull(),
    outcome: text("outcome", {
      enum: ["created", "updated", "skipped", "failed"],
    }).notNull(),
    error: text("error"),
    resultStudentId: text("result_student_id"),
  },
  (table) => [
    uniqueIndex("uq_import_rows_job_row").on(table.jobId, table.rowNumber),
    index("idx_import_rows_org_job").on(table.organizationId, table.jobId),
  ],
);
