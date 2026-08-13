import { describe, expect, it } from "vitest";
import { assetsListSchema, createAssetSchema, updateAssetSchema } from "../src/asset.ts";

describe("器材校验", () => {
  it("列表非法参数回退到稳定默认值", () => {
    expect(assetsListSchema.parse({ page: "bad", status: "unknown" })).toMatchObject({
      page: 1,
      sort: "name",
      order: "asc",
      status: "active",
    });
  });

  it("空白可选字段归一为 null", () => {
    expect(
      createAssetSchema.parse({
        orgId: "org_1",
        name: "  Alto saxophone ",
        type: " Instrument ",
        serialNumber: " ",
        notes: "",
      }),
    ).toMatchObject({
      name: "Alto saxophone",
      type: "Instrument",
      serialNumber: null,
      notes: null,
    });
  });

  it("拒绝没有实际修改字段的更新", () => {
    expect(() => updateAssetSchema.parse({ orgId: "org_1", assetId: "ast_1" })).toThrow();
  });
});
