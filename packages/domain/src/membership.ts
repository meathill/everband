// Membership 角色与状态机（PRD §3.1/§9）。
//
// 角色模型（PRD §3.2）：role 保存基础身份，staffAccess 是叠加在 parent 身份上的
// 授权位（被授权后获得 staff 运营权限，撤销后恢复普通 parent 可见性）。
// Owner 隐式拥有 staff 权限。

export type MembershipRole = "owner" | "staff" | "parent";
export type MembershipStatus = "invited" | "active" | "suspended" | "removed";

// Owner 隐式含 staff；staffAccess 只对 parent 身份有意义
export function hasStaffAccess(role: MembershipRole, staffAccess: boolean): boolean {
  return role === "owner" || role === "staff" || staffAccess;
}

export function isStaffRole(role: MembershipRole): boolean {
  return role === "owner" || role === "staff";
}

const TRANSITIONS: Record<MembershipStatus, readonly MembershipStatus[]> = {
  invited: ["active", "removed"],
  active: ["suspended", "removed"],
  suspended: ["active", "removed"],
  removed: [],
};

export function canTransitionMembership(from: MembershipStatus, to: MembershipStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

// ---- 角色转换规则（staff 管理只限 owner）----

// staffAccess 授权位只能落在 parent 身份上；role 已是 staff 的成员不需要授权位，
// owner 的授权位没有意义（owner 隐式含 staff）。
export function canGrantStaffAccess(role: MembershipRole): boolean {
  return role === "parent";
}

export interface OwnershipTarget {
  role: MembershipRole;
  status: MembershipStatus;
  staffAccess: boolean;
}

// transfer owner 的目标必须是 active 且具备 staff 权限的成员，且不能是 owner 自己
// （owner 之间不转移）。转移后原 owner 自动变 staff（role 转换，见 core）。
export function canTransferOwnership(target: OwnershipTarget): boolean {
  return (
    target.status === "active" &&
    target.role !== "owner" &&
    hasStaffAccess(target.role, target.staffAccess)
  );
}
