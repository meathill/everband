import { env } from "cloudflare:workers";
import { recordAudit } from "@everband/core";
import { schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
import {
  deleteAttachmentSchema,
  MAX_ATTACHMENT_BYTES,
  uploadAttachmentSchema,
} from "@everband/validation";
import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { getDb } from "./context.ts";
import { requireMembership, STAFF_ROLES } from "./guards.ts";

function decodeBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// staff 上传活动附件（MVP：≤5MB base64；更大文件后续走分片）
export const uploadEventAttachment = createServerFn({ method: "POST" })
  .validator(uploadAttachmentSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const now = Date.now();

    const events = await db
      .select({ id: schema.events.id })
      .from(schema.events)
      .where(and(eq(schema.events.id, data.eventId), eq(schema.events.organizationId, data.orgId)))
      .limit(1);
    if (!events[0]) {
      return { ok: false as const, error: "Event not found." };
    }

    const bytes = decodeBase64(data.dataBase64);
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      return { ok: false as const, error: "File is larger than 5 MB." };
    }

    const attachmentId = generateId(ID_PREFIXES.attachment);
    const r2Key = `org/${data.orgId}/event/${data.eventId}/${attachmentId}`;
    await env.FILES.put(r2Key, bytes, {
      httpMetadata: { contentType: data.contentType },
    });
    await db.insert(schema.attachments).values({
      id: attachmentId,
      organizationId: data.orgId,
      ownerType: "event",
      ownerId: data.eventId,
      r2Key,
      fileName: data.fileName,
      contentType: data.contentType,
      sizeBytes: bytes.byteLength,
      uploadedByMembershipId: ctx.membershipId,
      createdAt: now,
    });
    await recordAudit(db, {
      organizationId: data.orgId,
      actorMembershipId: ctx.membershipId,
      action: "attachment.uploaded",
      objectType: "attachment",
      objectId: attachmentId,
      summary: { eventId: data.eventId, fileName: data.fileName, sizeBytes: bytes.byteLength },
    });
    return { ok: true as const, attachmentId };
  });

// 与上传对称：先删行拿到 r2Key（保证归属校验通过），再清 R2 对象。
// 顺序反过来的话，R2 删成功而 db 失败会留下指向空对象的下载链接。
export const deleteAttachment = createServerFn({ method: "POST" })
  .validator(deleteAttachmentSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const rows = await db
      .delete(schema.attachments)
      .where(
        and(
          eq(schema.attachments.id, data.attachmentId),
          eq(schema.attachments.organizationId, data.orgId),
        ),
      )
      .returning({ r2Key: schema.attachments.r2Key, fileName: schema.attachments.fileName });
    const deleted = rows[0];
    if (!deleted) {
      return { ok: false as const, error: "Attachment not found." };
    }
    await env.FILES.delete(deleted.r2Key);
    await recordAudit(db, {
      organizationId: data.orgId,
      actorMembershipId: ctx.membershipId,
      action: "attachment.deleted",
      objectType: "attachment",
      objectId: data.attachmentId,
      summary: { fileName: deleted.fileName },
    });
    return { ok: true as const };
  });
