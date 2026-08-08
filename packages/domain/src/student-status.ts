// 学生状态机（PRD §5.1）。
// interested：了解中；active：在组织中（必须属于一个 group）；
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

// active 学生必须有 group；其他状态允许保留 group 引用（历史信息）
export function validateStudentGroup(
  status: StudentStatus,
  groupId: string | null,
): { valid: boolean; reason?: string } {
  if (status === "active" && !groupId) {
    return { valid: false, reason: "Active students must belong to a group" };
  }
  return { valid: true };
}

// 当前运营受众：只有 active 学生进入运营通知/排练轮换（PRD §9）
export function isOperationalStudent(status: StudentStatus): boolean {
  return status === "active";
}
