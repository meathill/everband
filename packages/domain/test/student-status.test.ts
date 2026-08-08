import { describe, expect, it } from "vitest";
import {
  canTransitionStudent,
  isOperationalStudent,
  STUDENT_STATUSES,
  validateStudentGroup,
} from "../src/student-status.ts";

describe("学生状态机", () => {
  it("合法转换", () => {
    expect(canTransitionStudent("interested", "active")).toBe(true);
    expect(canTransitionStudent("active", "withdrawn")).toBe(true);
    expect(canTransitionStudent("withdrawn", "active")).toBe(true);
    expect(canTransitionStudent("active", "archived")).toBe(true);
  });

  it("archived 是终态", () => {
    for (const to of STUDENT_STATUSES) {
      if (to !== "archived") {
        expect(canTransitionStudent("archived", to)).toBe(false);
      }
    }
  });

  it("同状态视为合法（幂等更新）", () => {
    for (const status of STUDENT_STATUSES) {
      expect(canTransitionStudent(status, status)).toBe(true);
    }
  });

  it("active 必须绑定 group", () => {
    expect(validateStudentGroup("active", null).valid).toBe(false);
    expect(validateStudentGroup("active", "grp_x").valid).toBe(true);
    expect(validateStudentGroup("interested", null).valid).toBe(true);
    expect(validateStudentGroup("withdrawn", null).valid).toBe(true);
  });

  it("运营受众只含 active", () => {
    expect(isOperationalStudent("active")).toBe(true);
    expect(isOperationalStudent("interested")).toBe(false);
    expect(isOperationalStudent("withdrawn")).toBe(false);
    expect(isOperationalStudent("archived")).toBe(false);
  });
});
