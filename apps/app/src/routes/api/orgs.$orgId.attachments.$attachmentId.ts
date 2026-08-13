import { env } from "cloudflare:workers";
import { canParentAccessEvent } from "@everband/core";
import { schema } from "@everband/db";
import { hasStaffAccess } from "@everband/domain";
import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { getDb } from "~/server/context.ts";
import { getSessionUser } from "~/server/session.ts";

// 私有附件下载（PRD §5.2/§8.4）：
// session → membership → 受众授权 → R2 流式返回。
// 任何失败（不存在/无权/跨组织）一律统一 404，不泄露文件是否存在。

const NOT_FOUND = () => new Response("Not found", { status: 404 });

export const Route = createFileRoute("/api/orgs/$orgId/attachments/$attachmentId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { orgId, attachmentId } = params;
        const db = getDb();
        const user = await getSessionUser(db);
        if (!user) {
          return NOT_FOUND();
        }

        const memberships = await db
          .select({
            role: schema.memberships.role,
            staffAccess: schema.memberships.staffAccess,
          })
          .from(schema.memberships)
          .where(
            and(
              eq(schema.memberships.organizationId, orgId),
              eq(schema.memberships.userId, user.id),
              eq(schema.memberships.status, "active"),
            ),
          )
          .limit(1);
        const membership = memberships[0];
        if (!membership) {
          return NOT_FOUND();
        }

        const attachments = await db
          .select()
          .from(schema.attachments)
          .where(
            and(
              eq(schema.attachments.id, attachmentId),
              eq(schema.attachments.organizationId, orgId),
            ),
          )
          .limit(1);
        const attachment = attachments[0];
        if (!attachment) {
          return NOT_FOUND();
        }

        const isStaff = hasStaffAccess(membership.role, membership.staffAccess);
        if (!isStaff) {
          // parent：只有活动受众内的附件可下载
          if (attachment.ownerType !== "event" && attachment.ownerType !== "event_update") {
            return NOT_FOUND();
          }
          let eventId = attachment.ownerId;
          if (attachment.ownerType === "event_update") {
            const updates = await db
              .select({ eventId: schema.eventUpdates.eventId })
              .from(schema.eventUpdates)
              .where(eq(schema.eventUpdates.id, attachment.ownerId))
              .limit(1);
            if (!updates[0]) {
              return NOT_FOUND();
            }
            eventId = updates[0].eventId;
          }
          const allowed = await canParentAccessEvent(db, orgId, user.id, eventId);
          if (!allowed) {
            return NOT_FOUND();
          }
        }

        const object = await env.FILES.get(attachment.r2Key);
        if (!object) {
          return NOT_FOUND();
        }
        return new Response(object.body as unknown as ReadableStream, {
          headers: {
            "Content-Type": attachment.contentType,
            "Content-Length": String(attachment.sizeBytes),
            "Content-Disposition": `attachment; filename="${attachment.fileName.replace(/"/g, "")}"`,
            "Cache-Control": "private, no-store",
          },
        });
      },
    },
  },
});
