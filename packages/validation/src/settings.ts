import { z } from "zod";
import { importJobsListSchema } from "./import.ts";

export const SETTINGS_SECTIONS = [
  "general",
  "staff-access",
  "terms",
  "public-profile",
  "data-import",
] as const;

export const settingsSearchSchema = importJobsListSchema.extend({
  section: z.enum(SETTINGS_SECTIONS).default("general").catch("general"),
});

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
