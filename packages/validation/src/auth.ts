import { z } from "zod";
import { emailSchema } from "./email.ts";

// 登录后回跳目标：仅允许站内绝对路径，排除 "//evil.com" 协议相对形式与反斜杠变体（防开放重定向）。
// login/verify 的 validateSearch 与 requestLoginSchema 共用此定义，不要另写第二套正则。
export const redirectPathSchema = z.string().max(200).regex(/^\/(?!\/|\\)/);

export const requestLoginSchema = z.object({
  email: emailSchema,
  redirect: redirectPathSchema.optional(),
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
