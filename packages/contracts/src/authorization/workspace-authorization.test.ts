import {describe, expect, it} from "vitest";

import {
  WORKSPACE_ACTIONS,
  WORKSPACE_PERMISSIONS,
  WORKSPACE_ROLES,
  canPerform,
} from "./workspace-authorization.js";

describe("workspace authorization policy", () => {
  it("defines every action explicitly for every role", () => {
    for (const role of WORKSPACE_ROLES) {
      expect(Object.keys(WORKSPACE_PERMISSIONS[role]).sort()).toEqual(
        [...WORKSPACE_ACTIONS].sort(),
      );
    }
  });

  it("gives each role materially different task capabilities", () => {
    expect(canPerform("administrator", "member.change-role")).toBe(true);
    expect(canPerform("editor", "member.change-role")).toBe(false);
    expect(canPerform("editor", "task.update")).toBe(true);
    expect(canPerform("viewer", "task.update")).toBe(false);
    expect(canPerform("viewer", "task.read")).toBe(true);
  });

  it("does not let non-administrators manage workspace membership", () => {
    const membershipActions = [
      "member.add",
      "member.change-role",
      "member.remove",
    ] as const;

    for (const role of ["editor", "viewer"] as const) {
      for (const action of membershipActions) {
        expect(canPerform(role, action)).toBe(false);
      }
    }
  });
});