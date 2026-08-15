// 群发写信草稿（每 membership 每组织一条，写信页自动保存防丢失）。
// 草稿包含内容 + 收件人 + 受众选择；恢复时原样加载，发送成功后删除。

import type { Database } from "@everband/db";
import { schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
import { and, desc, eq } from "drizzle-orm";
import type { AudienceContact } from "./events.ts";

// 受众选择与写信页 search 参数同形状（groups/students/event/excludeForm），
// 恢复草稿时原样回填；发送时由 server 转成 AudienceSelection 做白名单校验。
export interface EmailDraftSelection {
  groups?: string[];
  students?: string[];
  event?: string;
  excludeForm?: boolean;
}

export interface EmailDraftContent {
  subject: string;
  cc: string;
  html: string;
  text: string;
  recipients: AudienceContact[];
  selection: EmailDraftSelection;
}

export interface EmailDraftRow extends EmailDraftContent {
  id: string;
  createdAt: number;
  updatedAt: number;
}

function parseDraft(row: {
  id: string;
  subject: string;
  cc: string | null;
  html: string;
  text: string;
  recipientsJson: string;
  selectionJson: string;
  createdAt: number;
  updatedAt: number;
}): EmailDraftRow {
  let recipients: AudienceContact[] = [];
  let selection: EmailDraftSelection = {};
  try {
    recipients = JSON.parse(row.recipientsJson) as AudienceContact[];
  } catch {
    // 容错：损坏的 JSON 视为空草稿，不阻塞页面
  }
  try {
    selection = JSON.parse(row.selectionJson) as EmailDraftSelection;
  } catch {
    // 同上
  }
  return {
    id: row.id,
    subject: row.subject,
    cc: row.cc ?? "",
    html: row.html,
    text: row.text,
    recipients,
    selection,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// upsert：同一成员在组织内只有一条草稿，重复保存覆盖
export async function saveEmailDraftCore(
  db: Database,
  orgId: string,
  membershipId: string,
  content: EmailDraftContent,
  now: number,
): Promise<{ draftId: string }> {
  const existing = await db
    .select({ id: schema.emailDrafts.id })
    .from(schema.emailDrafts)
    .where(
      and(
        eq(schema.emailDrafts.organizationId, orgId),
        eq(schema.emailDrafts.membershipId, membershipId),
      ),
    )
    .limit(1);
  const draftId = existing[0]?.id ?? generateId(ID_PREFIXES.emailDraft);
  const values = {
    subject: content.subject,
    cc: content.cc || null,
    html: content.html,
    text: content.text,
    recipientsJson: JSON.stringify(content.recipients),
    selectionJson: JSON.stringify(content.selection),
    updatedAt: now,
  };
  if (existing[0]) {
    await db
      .update(schema.emailDrafts)
      .set(values)
      .where(eq(schema.emailDrafts.id, existing[0].id));
  } else {
    await db.insert(schema.emailDrafts).values({
      id: draftId,
      organizationId: orgId,
      membershipId,
      ...values,
      createdAt: now,
    });
  }
  return { draftId };
}

// 当前成员的草稿（单条，但保持列表形状便于 UI 复用与后续扩展）
export async function listEmailDraftsCore(
  db: Database,
  orgId: string,
  membershipId: string,
): Promise<EmailDraftRow[]> {
  const rows = await db
    .select()
    .from(schema.emailDrafts)
    .where(
      and(
        eq(schema.emailDrafts.organizationId, orgId),
        eq(schema.emailDrafts.membershipId, membershipId),
      ),
    )
    .orderBy(desc(schema.emailDrafts.updatedAt))
    .limit(10);
  return rows.map(parseDraft);
}

export async function deleteEmailDraftCore(
  db: Database,
  orgId: string,
  membershipId: string,
  draftId: string,
): Promise<{ ok: boolean }> {
  const deleted = await db
    .delete(schema.emailDrafts)
    .where(
      and(
        eq(schema.emailDrafts.id, draftId),
        eq(schema.emailDrafts.organizationId, orgId),
        eq(schema.emailDrafts.membershipId, membershipId),
      ),
    )
    .returning({ id: schema.emailDrafts.id });
  return { ok: deleted.length > 0 };
}

// 发送成功后清空该成员的草稿：草稿可能尚未自动保存（1s debounce 窗口内就点了发送），
// 无法拿到 draftId，所以按 membership 整条清理——草稿语义就是"未发送的写信内容"。
export async function deleteMemberDraftsCore(
  db: Database,
  orgId: string,
  membershipId: string,
): Promise<void> {
  await db
    .delete(schema.emailDrafts)
    .where(
      and(
        eq(schema.emailDrafts.organizationId, orgId),
        eq(schema.emailDrafts.membershipId, membershipId),
      ),
    );
}
