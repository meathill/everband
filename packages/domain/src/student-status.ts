// 学生状态机（PRD §5.1）。
// interested：了解中；active：在组织中；
// withdrawn：已退出（可回归）；archived：历史记录（终态）。

export type StudentStatus = "interested" | "active" | "withdrawn" | "archived";

export const STUDENT_STATUSES: readonly StudentStatus[] = [
  "interested",
  "active",
  "withdrawn",
  "archived",
];

const TRANSITIONS: Record<StudentStatus, readonly StudentStatus[]> = {
  interested: ["active", "withdrawn", "archived"],
  active: ["withdrawn", "archived"],
  withdrawn: ["active", "archived"],
  archived: [],
};

export function canTransitionStudent(from: StudentStatus, to: StudentStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

// Group 功能暂停后，新旧学生都允许无分组；保留参数用于兼容旧数据调用。
export function validateStudentGroup(
  _status: StudentStatus,
  _groupId: string | null,
): { valid: boolean; reason?: string } {
  return { valid: true };
}

// 当前运营受众：只有 active 学生进入运营通知/排练轮换（PRD §9）
export function isOperationalStudent(status: StudentStatus): boolean {
  return status === "active";
}
