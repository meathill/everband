import { z } from "zod";
import { emailSchema } from "./email.ts";

export const requestLoginSchema = z.object({
  email: emailSchema,
});

export const verifyOtpSchema = z.object({
  email: emailSchema,
  otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your email"),
});

export const verifyTokenSchema = z.object({
  token: z.string().min(16).max(128),
});

export type RequestLoginInput = z.infer<typeof requestLoginSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type VerifyTokenInput = z.infer<typeof verifyTokenSchema>;
