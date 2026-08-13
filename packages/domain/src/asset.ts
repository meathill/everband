export type AssetStatus = "active" | "retired";

// 公开器材卡只显示“名字 + 姓氏首字母”。单段姓名无法区分姓氏时只留首字符，
// 避免把未成年人的完整姓名放在无需登录的页面上。
export function formatPublicHolderName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return `${Array.from(parts[0] ?? "")[0] ?? ""}…`;
  const firstName = parts[0] ?? "";
  const surname = parts.at(-1) ?? "";
  return `${firstName} ${Array.from(surname)[0] ?? ""}.`;
}
