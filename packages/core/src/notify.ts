// 通知与邮件 fan-out 核心（PRD §5.5）。
// prepareEmailSend：生产侧一次性落"任务 + 受众快照"（dedupKey 幂等）；
// processEmailSend：消费侧逐收件人发送（消费前状态检查，重投不重发）。

import type { Database } from "@everband/db";
import { schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
import type { EmailSender } from "@everband/integrations/email";
import { and, eq, inArray } from "drizzle-orm";
import type { AudienceContact } from "./events.ts";

export interface PrepareEmailSendInput {
  organizationId: string;
  kind: string;
  subject: string;
  body: string;
  objectType: string;
  objectId: string;
  dedupKey: string;
  audience: AudienceContact[];
  // 已退订非必要运营邮件的地址（快照中标记 suppressed，不发送）
  suppressedEmails: ReadonlySet<string>;
  requestedByMembershipId: string;
}

export interface PrepareEmailSendResult {
  sendId: string;
  created: boolean;
  queuedCount: number;
  suppressedCount: number;
}

export async function prepareEmailSend(
  db: Database,
  input: PrepareEmailSendInput,
  now: number,
): Promise<PrepareEmailSendResult> {
  const existing = await db
    .select({ id: schema.emailSends.id })
    .from(schema.emailSends)
    .where(eq(schema.emailSends.dedupKey, input.dedupKey))
    .limit(1);
  const found = existing[0];
  if (found) {
    return { sendId: found.id, created: false, queuedCount: 0, suppressedCount: 0 };
  }

  const sendId = generateId(ID_PREFIXES.emailSend);
  const queued = input.audience.filter((contact) => !input.suppressedEmails.has(contact.email));
  const suppressed = input.audience.filter((contact) => input.suppressedEmails.has(contact.email));

  await db.insert(schema.emailSends).values({
    id: sendId,
    organizationId: input.organizationId,
    kind: input.kind,
    subject: input.subject,
    body: input.body,
    objectType: input.objectType,
    objectId: input.objectId,
    requestedByMembershipId: input.requestedByMembershipId,
    dedupKey: input.dedupKey,
    status: "queued",
    recipientCount: input.audience.length,
    suppressedCount: suppressed.length,
    createdAt: now,
  });
  if (input.audience.length > 0) {
    await db.insert(schema.emailSendRecipients).values(
      input.audience.map((contact) => ({
        id: generateId(ID_PREFIXES.emailSendRecipient),
        sendId,
        organizationId: input.organizationId,
        email: contact.email,
        contactId: contact.contactId,
        status: input.suppressedEmails.has(contact.email)
          ? ("suppressed" as const)
          : ("queued" as const),
      })),
    );
  }
  return { sendId, created: true, queuedCount: queued.length, suppressedCount: suppressed.length };
}

// 消费者：逐收件人发送。重投递安全——只处理仍为 queued 的收件人。
export async function processEmailSend(
  db: Database,
  sender: EmailSender,
  sendId: string,
  now: number,
): Promise<{ processed: boolean }> {
  const claimed = await db
    .update(schema.emailSends)
    .set({ status: "processing" })
    .where(
      and(
        eq(schema.emailSends.id, sendId),
        inArray(schema.emailSends.status, ["queued", "processing"]),
      ),
    )
    .returning({
      id: schema.emailSends.id,
      subject: schema.emailSends.subject,
      body: schema.emailSends.body,
      kind: schema.emailSends.kind,
    });
  const send = claimed[0];
  if (!send) {
    return { processed: false };
  }

  const recipients = await db
    .select({ id: schema.emailSendRecipients.id, email: schema.emailSendRecipients.email })
    .from(schema.emailSendRecipients)
    .where(
      and(
        eq(schema.emailSendRecipients.sendId, sendId),
        eq(schema.emailSendRecipients.status, "queued"),
      ),
    );

  for (const recipient of recipients) {
    const result = await sender.send({
      to: recipient.email,
      subject: send.subject,
      text: send.body,
      kind: send.kind,
    });
    await db
      .update(schema.emailSendRecipients)
      .set(
        result.ok
          ? { status: "sent", sentAt: now, attemptCount: 1 }
          : { status: "failed", error: result.error, attemptCount: 1 },
      )
      .where(eq(schema.emailSendRecipients.id, recipient.id));
  }

  // 汇总终态：任何 queued 之外的组合 → succeeded / partial / failed
  const rows = await db
    .select({ status: schema.emailSendRecipients.status })
    .from(schema.emailSendRecipients)
    .where(eq(schema.emailSendRecipients.sendId, sendId));
  const sent = rows.filter((row) => row.status === "sent").length;
  const failed = rows.filter((row) => row.status === "failed").length;
  const finalStatus = failed === 0 ? "succeeded" : sent === 0 ? "failed" : "partial";
  await db
    .update(schema.emailSends)
    .set({ status: finalStatus, sentCount: sent, failedCount: failed, finishedAt: now })
    .where(eq(schema.emailSends.id, sendId));
  return { processed: true };
}

// 站内通知：按 membership 批量写入
export async function createNotifications(
  db: Database,
  organizationId: string,
  membershipIds: string[],
  content: {
    type: string;
    title: string;
    linkPath?: string;
    objectType?: string;
    objectId?: string;
  },
  now: number,
): Promise<void> {
  if (membershipIds.length === 0) {
    return;
  }
  await db.insert(schema.notifications).values(
    membershipIds.map((membershipId) => ({
      id: generateId(ID_PREFIXES.notification),
      organizationId,
      membershipId,
      type: content.type,
      title: content.title,
      linkPath: content.linkPath ?? null,
      objectType: content.objectType ?? null,
      objectId: content.objectId ?? null,
      createdAt: now,
    })),
  );
}

// 受众邮箱 → 对应的 active membership（站内通知目标 + 退订过滤都用它）
export async function membershipsForEmails(
  db: Database,
  organizationId: string,
  emails: string[],
): Promise<{ membershipId: string; email: string; operationalEmailOptOut: boolean }[]> {
  if (emails.length === 0) {
    return [];
  }
  const rows = await db
    .select({
      membershipId: schema.memberships.id,
      email: schema.memberships.invitedEmail,
      operationalEmailOptOut: schema.memberships.operationalEmailOptOut,
    })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.organizationId, organizationId),
        eq(schema.memberships.status, "active"),
        inArray(schema.memberships.invitedEmail, emails),
      ),
    );
  return rows;
}
