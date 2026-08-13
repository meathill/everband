import { describe, expect, it } from "vitest";
import {
  canGrantStaffAccess,
  canTransferOwnership,
  hasStaffAccess,
  isStaffRole,
  type MembershipRole,
  type MembershipStatus,
} from "../src/membership.ts";

describe("hasStaffAccess", () => {
  it("owner / staff 隐式具备 staff 权限", () => {
    expect(hasStaffAccess("owner", false)).toBe(true);
    expect(hasStaffAccess("staff", false)).toBe(true);
  });

  it("parent 只有在授权位打开时才具备", () => {
    expect(hasStaffAccess("parent", false)).toBe(false);
    expect(hasStaffAccess("parent", true)).toBe(true);
  });

  it("isStaffRole 只看角色本身", () => {
    expect(isStaffRole("owner")).toBe(true);
    expect(isStaffRole("staff")).toBe(true);
    expect(isStaffRole("parent")).toBe(false);
  });
});

describe("canGrantStaffAccess", () => {
  it("授权位只能落在 parent 身份上", () => {
    for (const role of ["owner", "staff", "parent"] as const) {
      expect(canGrantStaffAccess(role)).toBe(role === "parent");
    }
  });
});

describe("canTransferOwnership", () => {
  function target(
    overrides: Partial<{
      role: MembershipRole;
      status: MembershipStatus;
      staffAccess: boolean;
    }> = {},
  ) {
    return { role: "staff" as const, status: "active" as const, staffAccess: false, ...overrides };
  }

  it("active 且具备 staff 权限的成员可以接收", () => {
    expect(canTransferOwnership(target())).toBe(true);
    expect(canTransferOwnership(target({ role: "parent", staffAccess: true }))).toBe(true);
  });

  it("普通 parent、非 active、owner 都不能接收", () => {
    expect(canTransferOwnership(target({ role: "parent", staffAccess: false }))).toBe(false);
    expect(canTransferOwnership(target({ status: "invited" }))).toBe(false);
    expect(canTransferOwnership(target({ status: "suspended" }))).toBe(false);
    expect(canTransferOwnership(target({ status: "removed" }))).toBe(false);
    expect(canTransferOwnership(target({ role: "owner", staffAccess: false }))).toBe(false);
  });
});
