import { z } from "zod";
import { createListQuerySchema } from "./list.ts";

export const ASSET_STATUSES = ["active", "retired"] as const;
export const ASSET_STATUS_FILTERS = ["all", ...ASSET_STATUSES] as const;

export const assetsListSchema = createListQuerySchema({
  sortFields: ["name", "type", "status", "updatedAt"],
  defaultSort: "name",
  defaultOrder: "asc",
  defaultPageSize: 20,
}).extend({
  status: z.enum(ASSET_STATUS_FILTERS).default("active").catch("active"),
});

export const assetsPageSchema = assetsListSchema.extend({ orgId: z.string().min(1) });

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .optional();

const assetFields = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.string().trim().min(1).max(80),
  serialNumber: nullableText(120),
  currentHolderStudentId: z.string().min(1).nullable().optional(),
  notes: nullableText(1_000),
});

export const createAssetSchema = assetFields.extend({ orgId: z.string().min(1) });

export const updateAssetSchema = assetFields
  .partial()
  .extend({ orgId: z.string().min(1), assetId: z.string().min(1) })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.type !== undefined ||
      value.serialNumber !== undefined ||
      value.currentHolderStudentId !== undefined ||
      value.notes !== undefined,
    { message: "Provide at least one field to update" },
  );

export const updateAssetStatusSchema = z.object({
  orgId: z.string().min(1),
  assetId: z.string().min(1),
  status: z.enum(ASSET_STATUSES),
});

export const assetQrActionSchema = z.object({
  orgId: z.string().min(1),
  assetId: z.string().min(1),
});

export const publicAssetSchema = z.object({ assetId: z.string().min(1).max(64) });

export type AssetStatus = (typeof ASSET_STATUSES)[number];
export type AssetStatusFilter = (typeof ASSET_STATUS_FILTERS)[number];
export type AssetsListQuery = z.output<typeof assetsListSchema>;
export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
