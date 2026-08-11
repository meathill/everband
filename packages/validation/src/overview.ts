import { z } from "zod";
import { orgIdSchema } from "./org.ts";

export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use a YYYY-MM month value.");

export const overviewSearchSchema = z.object({
  month: monthSchema.optional(),
});

export const overviewRequestSchema = orgIdSchema.extend({
  month: monthSchema.optional(),
});

export type OverviewSearch = z.infer<typeof overviewSearchSchema>;
