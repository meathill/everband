import { z } from "zod";
import { emailSchema, normalizeEmail } from "./email.ts";
import { RELATIONSHIPS, STUDENT_STATUS_VALUES } from "./member.ts";

// CSV 导入（PRD §6.2）：模板字段、逐行校验、文件内重复检测。
// 全部纯函数，preview（干跑）与消费者共用同一套规则。

export const CSV_HEADERS = [
  "studentName",
  "contactName",
  "contactEmail",
  "relationship",
  "groupName",
  "status",
] as const;

export const CSV_TEMPLATE = `${CSV_HEADERS.join(",")}\nAlex Chen,Morgan Chen,morgan.chen@example.com,parent,Senior band,active\n`;

// RFC 4180 基本子集：支持双引号包裹、内嵌逗号与转义引号（""）
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const source = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      field = "";
      // 跳过纯空行
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }
      row = [];
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((value) => value.trim() !== "")) {
    rows.push(row);
  }
  return rows;
}

const importRowSchema = z.object({
  studentName: z.string().trim().min(1, "studentName is required").max(80),
  contactName: z.string().trim().min(1, "contactName is required").max(80),
  contactEmail: emailSchema,
  relationship: z.enum(RELATIONSHIPS, {
    error: "relationship must be parent, guardian or emergency",
  }),
  groupName: z
    .string()
    .trim()
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
  status: z
    .string()
    .trim()
    .transform((value) => (value === "" ? "active" : value))
    .pipe(
      z.enum(STUDENT_STATUS_VALUES, {
        error: "status must be one of interested/active/withdrawn/archived",
      }),
    ),
});

export type ImportRow = z.infer<typeof importRowSchema>;

export interface RowValidation {
  // 数据行号：从 1 开始（不含表头）
  rowNumber: number;
  ok: boolean;
  errors: string[];
  data?: ImportRow;
  // 文件内重复：与哪一行重复（email + studentName 相同）
  duplicateOfRow?: number;
}

export interface CsvValidationResult {
  headerError?: string;
  rows: RowValidation[];
}

export function validateImportCsv(text: string): CsvValidationResult {
  const parsed = parseCsv(text);
  const header = parsed[0];
  if (!header) {
    return { headerError: "The file is empty.", rows: [] };
  }
  const normalizedHeader = header.map((value) => value.trim());
  const missing = CSV_HEADERS.filter(
    (name) => name !== "groupName" && name !== "status" && !normalizedHeader.includes(name),
  );
  if (missing.length > 0) {
    return {
      headerError: `Missing required columns: ${missing.join(", ")}. Download the template to see the expected format.`,
      rows: [],
    };
  }
  const columnIndex = new Map(normalizedHeader.map((name, index) => [name, index]));

  const seen = new Map<string, number>();
  const rows: RowValidation[] = [];
  for (let i = 1; i < parsed.length; i++) {
    const cells = parsed[i] ?? [];
    const rowNumber = i;
    const raw: Record<string, string> = {};
    for (const name of CSV_HEADERS) {
      const index = columnIndex.get(name);
      raw[name] = index === undefined ? "" : (cells[index] ?? "");
    }
    const result = importRowSchema.safeParse(raw);
    if (!result.success) {
      rows.push({
        rowNumber,
        ok: false,
        errors: result.error.issues.map((issue) => issue.message),
      });
      continue;
    }
    const key = `${normalizeEmail(result.data.contactEmail)}|${result.data.studentName.toLowerCase()}`;
    const duplicateOfRow = seen.get(key);
    if (duplicateOfRow !== undefined) {
      rows.push({
        rowNumber,
        ok: false,
        errors: [`Duplicate of row ${duplicateOfRow} (same student and contact email)`],
        duplicateOfRow,
      });
      continue;
    }
    seen.set(key, rowNumber);
    rows.push({ rowNumber, ok: true, errors: [], data: result.data });
  }
  return { rows };
}
