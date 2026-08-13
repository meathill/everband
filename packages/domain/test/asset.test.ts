import { describe, expect, it } from "vitest";
import { formatPublicHolderName } from "../src/asset.ts";

describe("formatPublicHolderName", () => {
  it("保留名字并只展示姓氏首字母", () => {
    expect(formatPublicHolderName("Amy Williams")).toBe("Amy W.");
    expect(formatPublicHolderName("Mary Jane Watson")).toBe("Mary W.");
  });

  it("单段姓名只保留首字符", () => {
    expect(formatPublicHolderName("王小明")).toBe("王…");
  });

  it("忽略多余空白", () => {
    expect(formatPublicHolderName("  Amy   Williams  ")).toBe("Amy W.");
    expect(formatPublicHolderName("   ")).toBe("");
  });
});
