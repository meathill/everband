import { describe, expect, it } from "vitest";
import {
  CSV_HEADERS,
  CSV_TEMPLATE,
  LEGACY_CSV_HEADERS,
  parseCsv,
  validateImportCsv,
} from "../src/csv.ts";

describe("parseCsv", () => {
  it("解析基本行与引号字段", () => {
    const rows = parseCsv('a,b,c\n"x, y",z,"with ""quotes"""\n');
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["x, y", "z", 'with "quotes"'],
    ]);
  });

  it("跳过空行，兼容 CRLF", () => {
    const rows = parseCsv("a,b\r\n\r\n1,2\r\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("validateImportCsv", () => {
  const header = CSV_HEADERS.join(",");

  it("模板本身可通过校验", () => {
    const result = validateImportCsv(CSV_TEMPLATE);
    expect(result.headerError).toBeUndefined();
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.ok).toBe(true);
  });

  it("新模板不含 groupName，旧模板仍兼容", () => {
    expect(CSV_HEADERS).not.toContain("groupName");
    const legacy = `${LEGACY_CSV_HEADERS.join(",")}\nKid,Parent,p@x.com,parent,Senior band,active\n`;
    const result = validateImportCsv(legacy);
    expect(result.rows[0]?.data?.groupName).toBe("Senior band");
  });

  it("缺少必需列时报表头错误", () => {
    const result = validateImportCsv("studentName,contactName\nA,B\n");
    expect(result.headerError).toContain("contactEmail");
  });

  it("非法邮箱与非法关系逐行报错", () => {
    const result = validateImportCsv(
      `${header}\nKid,Parent,not-an-email,parent,,\nKid2,Parent2,p2@x.com,cousin,,\n`,
    );
    expect(result.rows[0]?.ok).toBe(false);
    expect(result.rows[1]?.ok).toBe(false);
    expect(result.rows[1]?.errors[0]).toContain("relationship");
  });

  it("status 缺省为 active，邮箱规范化小写", () => {
    const result = validateImportCsv(`${header}\nKid,Parent, MIXED@Case.COM ,parent,,\n`);
    expect(result.rows[0]?.ok).toBe(true);
    expect(result.rows[0]?.data?.status).toBe("active");
    expect(result.rows[0]?.data?.contactEmail).toBe("mixed@case.com");
  });

  it("文件内重复（同邮箱同学生）标记重复行", () => {
    const result = validateImportCsv(
      `${header}\nKid,Parent,p@x.com,parent,,\nKid,Parent,P@X.COM,guardian,,\nOther,Parent,p@x.com,parent,,\n`,
    );
    expect(result.rows[0]?.ok).toBe(true);
    expect(result.rows[1]?.ok).toBe(false);
    expect(result.rows[1]?.duplicateOfRow).toBe(1);
    // 同邮箱不同学生不算重复（一个联系人多个孩子）
    expect(result.rows[2]?.ok).toBe(true);
  });
});
