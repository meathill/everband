import { env } from "cloudflare:workers";
import { recordAudit } from "@everband/core";
import { schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
import { chooseShortLinkService, ShortLinkError } from "@everband/integrations/dyqr";
import { publicPageSchema, updatePublicProfileSchema } from "@everband/validation";
import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./context.ts";
import { requireMembership, STAFF_ROLES } from "./guards.ts";

function getShortLinkService() {
  return chooseShortLinkService(env.DYQR_MODE, env.DYQR_TOKEN);
}

function getShortLinkActionError(cause: ShortLinkError): string {
  if (cause.kind === "quota") return "The QR service plan limit has been reached.";
  if (cause.kind === "unauthorized") return "The QR service connection needs attention.";
  return "QR link service is temporarily unavailable. Try again later.";
}

// 公开主页数据：无认证。关闭或不存在一律返回 null（统一"暂未开放"，
// 不泄露组织是否存在，PRD §5.1/§6.6）
export const getPublicPage = createServerFn({ method: "GET" })
  .validator(publicPageSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const rows = await db
      .select({
        publicProfileEnabled: schema.organizations.publicProfileEnabled,
        publicDisplayName: schema.organizations.publicDisplayName,
        publicSummary: schema.organizations.publicSummary,
        name: schema.organizations.name,
        type: schema.organizations.type,
      })
      .from(schema.organizations)
      .where(eq(schema.organizations.publicSlug, data.slug))
      .limit(1);
    const org = rows[0];
    if (!org || !org.publicProfileEnabled) {
      return null;
    }
    // 只暴露展示字段白名单
    return {
      displayName: org.publicDisplayName ?? org.name,
      summary: org.publicSummary,
      type: org.type,
    };
  });

export const getPublicProfileSettings = createServerFn({ method: "GET" })
  .validator(z.object({ orgId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const db = getDb();
    await requireMembership(db, data.orgId, STAFF_ROLES);
    const orgs = await db
      .select({
        publicProfileEnabled: schema.organizations.publicProfileEnabled,
        publicSlug: schema.organizations.publicSlug,
        publicDisplayName: schema.organizations.publicDisplayName,
        publicSummary: schema.organizations.publicSummary,
        name: schema.organizations.name,
      })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, data.orgId))
      .limit(1);
    const qrCodes = await db
      .select()
      .from(schema.qrCodes)
      .where(
        and(
          eq(schema.qrCodes.organizationId, data.orgId),
          eq(schema.qrCodes.targetType, "org_entry"),
        ),
      );
    return { profile: orgs[0] ?? null, qrCodes };
  });

export const updatePublicProfile = createServerFn({ method: "POST" })
  .validator(updatePublicProfileSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const now = Date.now();

    const current = await db
      .select({ publicSlug: schema.organizations.publicSlug })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, data.orgId))
      .limit(1);
    const previousSlug = current[0]?.publicSlug ?? null;
    const nextSlug = data.publicSlug ?? previousSlug;
    if (data.enabled && !nextSlug) {
      return { ok: false as const, error: "Set a public link (slug) before enabling the page." };
    }

    // slug 变更必须同步 dyqr 短链 targetUrl（PRD §6.6 步骤 6）；
    // dyqr 不可用则放弃本次 slug 变更，避免已打印二维码失效
    if (nextSlug && previousSlug && nextSlug !== previousSlug) {
      const activeQrs = await db
        .select({ id: schema.qrCodes.id, dyqrAlias: schema.qrCodes.dyqrAlias })
        .from(schema.qrCodes)
        .where(
          and(
            eq(schema.qrCodes.organizationId, data.orgId),
            eq(schema.qrCodes.targetType, "org_entry"),
            eq(schema.qrCodes.status, "active"),
          ),
        );
      const service = getShortLinkService();
      const newTarget = `${getRequestUrl().origin}/p/${nextSlug}`;
      try {
        for (const qr of activeQrs) {
          await service.updateTarget(qr.dyqrAlias, newTarget);
          await db
            .update(schema.qrCodes)
            .set({ currentTargetUrl: newTarget, updatedAt: now })
            .where(eq(schema.qrCodes.id, qr.id));
          await recordAudit(db, {
            organizationId: data.orgId,
            actorMembershipId: ctx.membershipId,
            action: "qr_code.target_updated",
            objectType: "qr_code",
            objectId: qr.id,
            summary: { targetUrl: newTarget },
          });
        }
      } catch (cause) {
        if (cause instanceof ShortLinkError) {
          return {
            ok: false as const,
            error: "QR link service is temporarily unavailable — the public link was not changed.",
          };
        }
        throw cause;
      }
    }

    try {
      await db
        .update(schema.organizations)
        .set({
          publicProfileEnabled: data.enabled,
          publicSlug: nextSlug,
          publicDisplayName: data.publicDisplayName ?? null,
          publicSummary: data.publicSummary ?? null,
        })
        .where(eq(schema.organizations.id, data.orgId));
    } catch {
      return { ok: false as const, error: "This public link is already taken." };
    }
    await recordAudit(db, {
      organizationId: data.orgId,
      actorMembershipId: ctx.membershipId,
      action: data.enabled ? "public_profile.enabled" : "public_profile.disabled",
      objectType: "organization",
      objectId: data.orgId,
      summary: { publicSlug: nextSlug },
    });
    return { ok: true as const };
  });

export const createOrgEntryQr = createServerFn({ method: "POST" })
  .validator(z.object({ orgId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const now = Date.now();

    const orgs = await db
      .select({
        publicProfileEnabled: schema.organizations.publicProfileEnabled,
        publicSlug: schema.organizations.publicSlug,
        name: schema.organizations.name,
      })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, data.orgId))
      .limit(1);
    const org = orgs[0];
    if (!org?.publicProfileEnabled || !org.publicSlug) {
      return { ok: false as const, error: "Enable the public page first." };
    }

    const targetUrl = `${getRequestUrl().origin}/p/${org.publicSlug}`;
    let created: { alias: string; shortUrl: string };
    try {
      created = await getShortLinkService().createLink({
        targetUrl,
        title: `Everband entry: ${org.name}`,
      });
    } catch (cause) {
      if (cause instanceof ShortLinkError) {
        return {
          ok: false as const,
          error: getShortLinkActionError(cause),
        };
      }
      throw cause;
    }

    const qrId = generateId(ID_PREFIXES.qrCode);
    await db.insert(schema.qrCodes).values({
      id: qrId,
      organizationId: data.orgId,
      targetType: "org_entry",
      targetObjectId: data.orgId,
      dyqrAlias: created.alias,
      shortUrl: created.shortUrl,
      currentTargetUrl: targetUrl,
      status: "active",
      createdByMembershipId: ctx.membershipId,
      createdAt: now,
      updatedAt: now,
    });
    // dyqr 侧日志无法反查组织，everband 侧必须记录（PRD §8.4）
    await recordAudit(db, {
      organizationId: data.orgId,
      actorMembershipId: ctx.membershipId,
      action: "qr_code.created",
      objectType: "qr_code",
      objectId: qrId,
      summary: { alias: created.alias, targetUrl },
    });
    return { ok: true as const, qrId, shortUrl: created.shortUrl };
  });

export const getQrImageData = createServerFn({ method: "GET" })
  .validator(
    z.object({
      orgId: z.string().min(1),
      qrId: z.string().min(1),
      format: z.enum(["svg", "png"]),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const rows = await db
      .select({ id: schema.qrCodes.id, dyqrAlias: schema.qrCodes.dyqrAlias })
      .from(schema.qrCodes)
      .where(and(eq(schema.qrCodes.id, data.qrId), eq(schema.qrCodes.organizationId, data.orgId)))
      .limit(1);
    const qr = rows[0];
    if (!qr) {
      return { ok: false as const, error: "QR code not found." };
    }
    try {
      const image = await getShortLinkService().getQrImage(qr.dyqrAlias, data.format);
      let binary = "";
      for (const byte of image.bytes) {
        binary += String.fromCharCode(byte);
      }
      return { ok: true as const, contentType: image.contentType, base64: btoa(binary) };
    } catch (cause) {
      if (cause instanceof ShortLinkError) {
        if (cause.kind === "not_found") {
          await db
            .update(schema.qrCodes)
            .set({ status: "broken", updatedAt: Date.now() })
            .where(eq(schema.qrCodes.id, qr.id));
          await recordAudit(db, {
            organizationId: data.orgId,
            actorMembershipId: ctx.membershipId,
            action: "qr_code.broken",
            objectType: "qr_code",
            objectId: qr.id,
          });
          return { ok: false as const, error: "This QR link no longer exists." };
        }
        return { ok: false as const, error: "QR link service is temporarily unavailable." };
      }
      throw cause;
    }
  });

export const refreshQrStats = createServerFn({ method: "POST" })
  .validator(z.object({ orgId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const now = Date.now();
    const service = getShortLinkService();
    const rows = await db
      .select({ id: schema.qrCodes.id, dyqrAlias: schema.qrCodes.dyqrAlias })
      .from(schema.qrCodes)
      .where(eq(schema.qrCodes.organizationId, data.orgId));
    for (const qr of rows) {
      try {
        const count = await service.getScanCount(qr.dyqrAlias);
        if (count !== null) {
          await db
            .update(schema.qrCodes)
            .set({ scanCount: count, lastStatsSyncAt: now })
            .where(eq(schema.qrCodes.id, qr.id));
        }
      } catch (cause) {
        if (cause instanceof ShortLinkError && cause.kind === "not_found") {
          await db
            .update(schema.qrCodes)
            .set({ status: "broken", updatedAt: now })
            .where(eq(schema.qrCodes.id, qr.id));
          await recordAudit(db, {
            organizationId: data.orgId,
            actorMembershipId: ctx.membershipId,
            action: "qr_code.broken",
            objectType: "qr_code",
            objectId: qr.id,
          });
        }
      }
    }
    return { ok: true as const };
  });
