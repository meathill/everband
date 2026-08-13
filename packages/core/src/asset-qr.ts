import type { Database } from "@everband/db";
import { schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
import { and, eq } from "drizzle-orm";
import type { AssetWriteResult } from "./assets.ts";
import { recordAudit } from "./audit.ts";

export interface AssetShortLinkService {
  createLink(input: { targetUrl: string; title?: string }): Promise<{
    alias: string;
    shortUrl: string;
  }>;
  removeLink(alias: string): Promise<void>;
  getScanCount(alias: string): Promise<number | null>;
}

export async function generateAssetQrCore(
  db: Database,
  orgId: string,
  assetId: string,
  actorMembershipId: string,
  origin: string,
  service: AssetShortLinkService,
  now: number,
): Promise<
  { ok: true; qrId: string; shortUrl: string; changed: boolean } | { ok: false; error: string }
> {
  const rows = await db
    .select({
      name: schema.assets.name,
      status: schema.assets.status,
      qrCodeId: schema.assets.qrCodeId,
      contactEmail: schema.organizations.contactEmail,
      qrStatus: schema.qrCodes.status,
      shortUrl: schema.qrCodes.shortUrl,
    })
    .from(schema.assets)
    .innerJoin(schema.organizations, eq(schema.assets.organizationId, schema.organizations.id))
    .leftJoin(schema.qrCodes, eq(schema.assets.qrCodeId, schema.qrCodes.id))
    .where(and(eq(schema.assets.id, assetId), eq(schema.assets.organizationId, orgId)))
    .limit(1);
  const asset = rows[0];
  if (!asset) return { ok: false, error: "Asset not found." };
  if (asset.status !== "active") return { ok: false, error: "Restore this asset first." };
  if (!asset.contactEmail) {
    return { ok: false, error: "Set the organization contact email before generating a QR code." };
  }
  if (asset.qrCodeId && asset.qrStatus !== "broken" && asset.shortUrl) {
    return {
      ok: true,
      qrId: asset.qrCodeId,
      shortUrl: asset.shortUrl,
      changed: false,
    };
  }

  const targetUrl = `${origin}/a/${assetId}`;
  let created: { alias: string; shortUrl: string };
  try {
    created = await service.createLink({ targetUrl, title: `Everband asset: ${asset.name}` });
  } catch (cause) {
    return { ok: false, error: getQrCreateError(cause) };
  }

  const qrId = generateId(ID_PREFIXES.qrCode, now);
  try {
    await db.insert(schema.qrCodes).values({
      id: qrId,
      organizationId: orgId,
      targetType: "asset",
      targetObjectId: assetId,
      dyqrAlias: created.alias,
      shortUrl: created.shortUrl,
      currentTargetUrl: targetUrl,
      status: "active",
      createdByMembershipId: actorMembershipId,
      createdAt: now,
      updatedAt: now,
    });
  } catch (cause) {
    await service.removeLink(created.alias).catch(() => undefined);
    const winner = await db
      .select({ id: schema.qrCodes.id, shortUrl: schema.qrCodes.shortUrl })
      .from(schema.qrCodes)
      .where(
        and(
          eq(schema.qrCodes.organizationId, orgId),
          eq(schema.qrCodes.targetType, "asset"),
          eq(schema.qrCodes.targetObjectId, assetId),
          eq(schema.qrCodes.status, "active"),
        ),
      )
      .limit(1);
    if (winner[0]) {
      await db
        .update(schema.assets)
        .set({ qrCodeId: winner[0].id, updatedByMembershipId: actorMembershipId, updatedAt: now })
        .where(and(eq(schema.assets.id, assetId), eq(schema.assets.organizationId, orgId)));
      return { ok: true, qrId: winner[0].id, shortUrl: winner[0].shortUrl, changed: false };
    }
    throw cause;
  }
  await db
    .update(schema.assets)
    .set({ qrCodeId: qrId, updatedByMembershipId: actorMembershipId, updatedAt: now })
    .where(and(eq(schema.assets.id, assetId), eq(schema.assets.organizationId, orgId)));
  await recordAudit(db, {
    organizationId: orgId,
    actorMembershipId,
    action: asset.qrStatus === "broken" ? "qr_code.replaced" : "qr_code.created",
    objectType: "qr_code",
    objectId: qrId,
    summary: { assetId, alias: created.alias, targetUrl },
  });
  return { ok: true, qrId, shortUrl: created.shortUrl, changed: true };
}

function getQrCreateError(cause: unknown): string {
  if (typeof cause === "object" && cause !== null && "kind" in cause) {
    const kind = (cause as { kind?: unknown }).kind;
    if (kind === "quota") return "The asset was saved, but the QR service plan limit was reached.";
    if (kind === "unauthorized") {
      return "The asset was saved, but the QR service connection needs attention.";
    }
  }
  return "The asset was saved, but the QR service is unavailable. Try generating it again later.";
}

export async function refreshAssetQrStatsCore(
  db: Database,
  orgId: string,
  assetId: string,
  actorMembershipId: string,
  service: AssetShortLinkService,
  now: number,
): Promise<AssetWriteResult> {
  const rows = await db
    .select({ id: schema.qrCodes.id, alias: schema.qrCodes.dyqrAlias })
    .from(schema.assets)
    .innerJoin(schema.qrCodes, eq(schema.assets.qrCodeId, schema.qrCodes.id))
    .where(and(eq(schema.assets.id, assetId), eq(schema.assets.organizationId, orgId)))
    .limit(1);
  const qr = rows[0];
  if (!qr) return { ok: false, error: "Generate a QR code first." };
  try {
    const scanCount = await service.getScanCount(qr.alias);
    if (scanCount === null) {
      return { ok: false, error: "QR scan statistics are temporarily unavailable." };
    }
    await db
      .update(schema.qrCodes)
      .set({ scanCount, lastStatsSyncAt: now, updatedAt: now })
      .where(eq(schema.qrCodes.id, qr.id));
    return { ok: true };
  } catch (cause) {
    if (!isNotFoundShortLinkError(cause)) {
      return { ok: false, error: "QR scan statistics are temporarily unavailable." };
    }
    await db
      .update(schema.qrCodes)
      .set({ status: "broken", updatedAt: now })
      .where(eq(schema.qrCodes.id, qr.id));
    await recordAudit(db, {
      organizationId: orgId,
      actorMembershipId,
      action: "qr_code.broken",
      objectType: "qr_code",
      objectId: qr.id,
      summary: { assetId },
    });
    return {
      ok: false,
      error: "This QR link no longer exists. Generate a replacement and reprint it.",
    };
  }
}

function isNotFoundShortLinkError(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "kind" in cause &&
    (cause as { kind?: unknown }).kind === "not_found"
  );
}
