import { z } from "zod";

// 邮箱规范化是全系统去重的基石（PRD §5.1）：
// 小写 + 去首尾空白。归并、比对一律先过这里。
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
