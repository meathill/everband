import { deleteTermCore, updateTermCore } from "@everband/core";
import { deleteTermSchema, updateTermSchema } from "@everband/validation";
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "./context.ts";
import { requireMembership, STAFF_ROLES } from "./guards.ts";

// 学期的改与删。创建与列表在 members.ts（学期是成员域的一部分），
// 这两条是 settings 页新增的写路径，单独成文件避免把 members.ts 撑得更长。

export const updateTerm = createServerFn({ method: "POST" })
  .validator(updateTermSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    return updateTermCore(
      db,
      data.orgId,
      data.termId,
      { name: data.name, startDate: data.startDate, endDate: data.endDate },
      ctx.membershipId,
    );
  });

export const deleteTerm = createServerFn({ method: "POST" })
  .validator(deleteTermSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    return deleteTermCore(db, data.orgId, data.termId, ctx.membershipId);
  });
