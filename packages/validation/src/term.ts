import { z } from "zod";

// 学期的修改与删除。创建走 member.ts 的 createTermSchema（学期随成员域一起落的地），
// 这里只补 settings 页需要的两条写路径。

const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

// 全部字段可选 = 只改传了的字段；起止日期要么都传要么都不传，
// 否则单边修改会跨过另一边（校验放在 refine 里，core 不再重复判断）。
export const updateTermSchema = z
  .object({
    orgId: z.string().min(1),
    termId: z.string().min(1),
    name: z.string().trim().min(1).max(60).optional(),
    startDate: localDateSchema.optional(),
    endDate: localDateSchema.optional(),
  })
  .refine((value) => (value.startDate === undefined) === (value.endDate === undefined), {
    message: "Change both dates together",
    path: ["endDate"],
  })
  .refine(
    (value) =>
      value.startDate === undefined ||
      value.endDate === undefined ||
      value.startDate <= value.endDate,
    { message: "Start date must be before end date", path: ["endDate"] },
  );

export const deleteTermSchema = z.object({
  orgId: z.string().min(1),
  termId: z.string().min(1),
});

export type UpdateTermInput = z.infer<typeof updateTermSchema>;
