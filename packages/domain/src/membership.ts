// Membership 角色与状态机（PRD §3.1/§9）。

export type MembershipRole = "owner" | "staff" | "parent";
export type MembershipStatus = "invited" | "active" | "suspended" | "removed";

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
