import type { Database } from "@everband/db";
import { schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";

export interface AuditInput {
  organizationId: string;
  // 系统自动操作传 null
  actorMembershipId: string | null;
  action: string;
  objectType: string;
  objectId: string;
  summary?: Record<string, unknown>;
  requestId?: string;
}

// 组织内关键写入必须调用（PRD §5.5/§9）。只 INSERT，无删改路径。
export async function recordAudit(db: Database, input: AuditInput): Promise<void> {
  await db.insert(schema.auditEntries).values({
    id: generateId(ID_PREFIXES.auditEntry),
    organizationId: input.organizationId,
    actorMembershipId: input.actorMembershipId,
    action: input.action,
    objectType: input.objectType,
    objectId: input.objectId,
    summaryJson: input.summary ? JSON.stringify(input.summary) : null,
    requestId: input.requestId ?? null,
    createdAt: Date.now(),
  });
}
