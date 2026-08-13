import type { Database } from "@everband/db";
import { schema } from "@everband/db";
import {
  type AssetStatus,
  formatPublicHolderName,
  generateId,
  ID_PREFIXES,
} from "@everband/domain";
import type {
  AssetStatusFilter,
  CreateAssetInput,
  ListResult,
  SortOrder,
  UpdateAssetInput,
} from "@everband/validation";
import { toOffset } from "@everband/validation";
import { and, asc, count, desc, eq, like, or, type SQL } from "drizzle-orm";
import { recordAudit } from "./audit.ts";

export interface AssetRow {
  id: string;
  name: string;
  type: string;
  serialNumber: string | null;
  currentHolderStudentId: string | null;
  currentHolderName: string | null;
  currentHolderStatus: string | null;
  notes: string | null;
  status: AssetStatus;
  qrCodeId: string | null;
  qrStatus: "active" | "disabled" | "broken" | null;
  shortUrl: string | null;
  scanCount: number | null;
  lastStatsSyncAt: number | null;
  createdAt: number;
  updatedAt: number;
  retiredAt: number | null;
}

export interface ListAssetsInput {
  page: number;
  pageSize: number;
  sort: string;
  order: SortOrder;
  q?: string;
  status: AssetStatusFilter;
}

const SORT_COLUMNS = {
  name: schema.assets.name,
  type: schema.assets.type,
  status: schema.assets.status,
  updatedAt: schema.assets.updatedAt,
} as const;

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export async function listAssetsCore(
  db: Database,
  orgId: string,
  input: ListAssetsInput,
): Promise<ListResult<AssetRow>> {
  const conditions: SQL[] = [eq(schema.assets.organizationId, orgId)];
  if (input.status !== "all") conditions.push(eq(schema.assets.status, input.status));
  if (input.q) {
    const pattern = `%${escapeLikePattern(input.q)}%`;
    conditions.push(
      or(
        like(schema.assets.name, pattern),
        like(schema.assets.type, pattern),
        like(schema.assets.serialNumber, pattern),
      ) as SQL,
    );
  }
  const where = and(...conditions);
  const column = SORT_COLUMNS[input.sort as keyof typeof SORT_COLUMNS] ?? SORT_COLUMNS.name;
  const direction = input.order === "desc" ? desc : asc;

  const [items, totals] = await Promise.all([
    db
      .select({
        id: schema.assets.id,
        name: schema.assets.name,
        type: schema.assets.type,
        serialNumber: schema.assets.serialNumber,
        currentHolderStudentId: schema.assets.currentHolderStudentId,
        currentHolderName: schema.students.name,
        currentHolderStatus: schema.students.status,
        notes: schema.assets.notes,
        status: schema.assets.status,
        qrCodeId: schema.assets.qrCodeId,
        qrStatus: schema.qrCodes.status,
        shortUrl: schema.qrCodes.shortUrl,
        scanCount: schema.qrCodes.scanCount,
        lastStatsSyncAt: schema.qrCodes.lastStatsSyncAt,
        createdAt: schema.assets.createdAt,
        updatedAt: schema.assets.updatedAt,
        retiredAt: schema.assets.retiredAt,
      })
      .from(schema.assets)
      .leftJoin(schema.students, eq(schema.assets.currentHolderStudentId, schema.students.id))
      .leftJoin(schema.qrCodes, eq(schema.assets.qrCodeId, schema.qrCodes.id))
      .where(where)
      .orderBy(direction(column), asc(schema.assets.id))
      .limit(input.pageSize)
      .offset(toOffset(input.page, input.pageSize)),
    db.select({ value: count() }).from(schema.assets).where(where),
  ]);
  return {
    items,
    total: totals[0]?.value ?? 0,
    page: input.page,
    pageSize: input.pageSize,
  };
}

export async function listAssetHolderOptionsCore(db: Database, orgId: string) {
  return db
    .select({ id: schema.students.id, name: schema.students.name })
    .from(schema.students)
    .where(and(eq(schema.students.organizationId, orgId), eq(schema.students.status, "active")))
    .orderBy(asc(schema.students.name), asc(schema.students.id));
}

async function validateHolder(db: Database, orgId: string, studentId: string | null | undefined) {
  if (!studentId) return null;
  const rows = await db
    .select({ id: schema.students.id })
    .from(schema.students)
    .where(
      and(
        eq(schema.students.id, studentId),
        eq(schema.students.organizationId, orgId),
        eq(schema.students.status, "active"),
      ),
    )
    .limit(1);
  return rows[0]?.id ?? undefined;
}

export type AssetWriteResult = { ok: true } | { ok: false; error: string };

export async function createAssetCore(
  db: Database,
  orgId: string,
  input: Omit<CreateAssetInput, "orgId">,
  actorMembershipId: string,
  now: number,
): Promise<{ ok: true; assetId: string } | { ok: false; error: string }> {
  const holderId = await validateHolder(db, orgId, input.currentHolderStudentId);
  if (input.currentHolderStudentId && !holderId) {
    return { ok: false, error: "Choose an active student from this organization." };
  }
  const assetId = generateId(ID_PREFIXES.asset, now);
  await db.insert(schema.assets).values({
    id: assetId,
    organizationId: orgId,
    name: input.name,
    type: input.type,
    serialNumber: input.serialNumber ?? null,
    currentHolderStudentId: holderId,
    notes: input.notes ?? null,
    status: "active",
    createdByMembershipId: actorMembershipId,
    updatedByMembershipId: actorMembershipId,
    createdAt: now,
    updatedAt: now,
  });
  await recordAudit(db, {
    organizationId: orgId,
    actorMembershipId,
    action: "asset.created",
    objectType: "asset",
    objectId: assetId,
    summary: { name: input.name, type: input.type, currentHolderStudentId: holderId },
  });
  return { ok: true, assetId };
}

export async function updateAssetCore(
  db: Database,
  orgId: string,
  assetId: string,
  input: Omit<UpdateAssetInput, "orgId" | "assetId">,
  actorMembershipId: string,
  now: number,
): Promise<AssetWriteResult> {
  const rows = await db
    .select({ id: schema.assets.id })
    .from(schema.assets)
    .where(and(eq(schema.assets.id, assetId), eq(schema.assets.organizationId, orgId)))
    .limit(1);
  if (!rows[0]) return { ok: false, error: "Asset not found." };

  const holderId = await validateHolder(db, orgId, input.currentHolderStudentId);
  if (input.currentHolderStudentId && !holderId) {
    return { ok: false, error: "Choose an active student from this organization." };
  }
  await db
    .update(schema.assets)
    .set({
      name: input.name,
      type: input.type,
      serialNumber: input.serialNumber,
      currentHolderStudentId: input.currentHolderStudentId === undefined ? undefined : holderId,
      notes: input.notes,
      updatedByMembershipId: actorMembershipId,
      updatedAt: now,
    })
    .where(and(eq(schema.assets.id, assetId), eq(schema.assets.organizationId, orgId)));
  await recordAudit(db, {
    organizationId: orgId,
    actorMembershipId,
    action: "asset.updated",
    objectType: "asset",
    objectId: assetId,
    summary: input,
  });
  return { ok: true };
}

export async function updateAssetStatusCore(
  db: Database,
  orgId: string,
  assetId: string,
  status: AssetStatus,
  actorMembershipId: string,
  now: number,
): Promise<AssetWriteResult> {
  const rows = await db
    .select({ status: schema.assets.status, qrCodeId: schema.assets.qrCodeId })
    .from(schema.assets)
    .where(and(eq(schema.assets.id, assetId), eq(schema.assets.organizationId, orgId)))
    .limit(1);
  const current = rows[0];
  if (!current) return { ok: false, error: "Asset not found." };
  if (current.status === status) return { ok: true };

  await db
    .update(schema.assets)
    .set({
      status,
      retiredAt: status === "retired" ? now : null,
      updatedByMembershipId: actorMembershipId,
      updatedAt: now,
    })
    .where(and(eq(schema.assets.id, assetId), eq(schema.assets.organizationId, orgId)));

  if (current.qrCodeId) {
    const qrs = await db
      .select({ status: schema.qrCodes.status })
      .from(schema.qrCodes)
      .where(and(eq(schema.qrCodes.id, current.qrCodeId), eq(schema.qrCodes.organizationId, orgId)))
      .limit(1);
    const qrStatus = qrs[0]?.status;
    const nextQrStatus =
      status === "retired" && qrStatus === "active"
        ? "disabled"
        : status === "active" && qrStatus === "disabled"
          ? "active"
          : null;
    if (nextQrStatus) {
      await db
        .update(schema.qrCodes)
        .set({ status: nextQrStatus, updatedAt: now })
        .where(eq(schema.qrCodes.id, current.qrCodeId));
      await recordAudit(db, {
        organizationId: orgId,
        actorMembershipId,
        action: nextQrStatus === "active" ? "qr_code.enabled" : "qr_code.disabled",
        objectType: "qr_code",
        objectId: current.qrCodeId,
        summary: { assetId },
      });
    }
  }
  await recordAudit(db, {
    organizationId: orgId,
    actorMembershipId,
    action: status === "retired" ? "asset.retired" : "asset.restored",
    objectType: "asset",
    objectId: assetId,
  });
  return { ok: true };
}

export async function getPublicAssetCore(db: Database, assetId: string) {
  const rows = await db
    .select({
      name: schema.assets.name,
      type: schema.assets.type,
      serialNumber: schema.assets.serialNumber,
      holderName: schema.students.name,
      holderStatus: schema.students.status,
      organizationName: schema.organizations.name,
      publicDisplayName: schema.organizations.publicDisplayName,
      contactEmail: schema.organizations.contactEmail,
    })
    .from(schema.assets)
    .innerJoin(schema.organizations, eq(schema.assets.organizationId, schema.organizations.id))
    .leftJoin(schema.students, eq(schema.assets.currentHolderStudentId, schema.students.id))
    .where(and(eq(schema.assets.id, assetId), eq(schema.assets.status, "active")))
    .limit(1);
  const asset = rows[0];
  if (!asset) return null;
  return {
    name: asset.name,
    type: asset.type,
    serialNumber: asset.serialNumber,
    currentHolder:
      asset.holderName && asset.holderStatus === "active"
        ? formatPublicHolderName(asset.holderName)
        : null,
    organizationName: asset.publicDisplayName ?? asset.organizationName,
    contactEmail: asset.contactEmail,
  };
}
