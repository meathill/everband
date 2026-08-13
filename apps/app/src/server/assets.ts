import { env } from "cloudflare:workers";
import {
  createAssetCore,
  generateAssetQrCore,
  getPublicAssetCore,
  listAssetHolderOptionsCore,
  listAssetsCore,
  refreshAssetQrStatsCore,
  updateAssetCore,
  updateAssetStatusCore,
} from "@everband/core";
import { chooseShortLinkService } from "@everband/integrations/dyqr";
import {
  assetQrActionSchema,
  assetsPageSchema,
  createAssetSchema,
  orgIdSchema,
  publicAssetSchema,
  updateAssetSchema,
  updateAssetStatusSchema,
} from "@everband/validation";
import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { getDb } from "./context.ts";
import { requireMembership, STAFF_ROLES } from "./guards.ts";

function getShortLinkService() {
  return chooseShortLinkService(env.DYQR_MODE, env.DYQR_TOKEN);
}

export const listAssets = createServerFn({ method: "GET" })
  .validator(assetsPageSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    await requireMembership(db, data.orgId, STAFF_ROLES);
    return listAssetsCore(db, data.orgId, data);
  });

export const listAssetHolderOptions = createServerFn({ method: "GET" })
  .validator(orgIdSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    await requireMembership(db, data.orgId, STAFF_ROLES);
    return listAssetHolderOptionsCore(db, data.orgId);
  });

export const createAsset = createServerFn({ method: "POST" })
  .validator(createAssetSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const { orgId, ...input } = data;
    const created = await createAssetCore(db, orgId, input, ctx.membershipId, Date.now());
    if (!created.ok) return created;

    const qr = await generateAssetQrCore(
      db,
      orgId,
      created.assetId,
      ctx.membershipId,
      getRequestUrl().origin,
      getShortLinkService(),
      Date.now(),
    );
    return {
      ok: true as const,
      assetId: created.assetId,
      qrGenerated: qr.ok,
      qrError: qr.ok ? undefined : qr.error,
    };
  });

export const updateAsset = createServerFn({ method: "POST" })
  .validator(updateAssetSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const { orgId, assetId, ...input } = data;
    return updateAssetCore(db, orgId, assetId, input, ctx.membershipId, Date.now());
  });

export const updateAssetStatus = createServerFn({ method: "POST" })
  .validator(updateAssetStatusSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    return updateAssetStatusCore(
      db,
      data.orgId,
      data.assetId,
      data.status,
      ctx.membershipId,
      Date.now(),
    );
  });

export const generateAssetQr = createServerFn({ method: "POST" })
  .validator(assetQrActionSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    return generateAssetQrCore(
      db,
      data.orgId,
      data.assetId,
      ctx.membershipId,
      getRequestUrl().origin,
      getShortLinkService(),
      Date.now(),
    );
  });

export const refreshAssetQrStats = createServerFn({ method: "POST" })
  .validator(assetQrActionSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    return refreshAssetQrStatsCore(
      db,
      data.orgId,
      data.assetId,
      ctx.membershipId,
      getShortLinkService(),
      Date.now(),
    );
  });

// 无需登录；core 只返回公开白名单，retired 与不存在统一为 null。
export const getPublicAsset = createServerFn({ method: "GET" })
  .validator(publicAssetSchema)
  .handler(({ data }) => getPublicAssetCore(getDb(), data.assetId));
