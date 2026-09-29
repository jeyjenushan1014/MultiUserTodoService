import {
  describe,
  expect,
  it,
} from "vitest";

import {
  addWorkspaceMemberSchema,
  changeWorkspaceMemberRoleSchema,
  createWorkspaceSchema,
  workspaceIdParamsSchema,
  workspaceMemberParamsSchema,
} from "../workspace.validation.js";

describe(
  "gateway workspace validation",
  () => {
    it(
      "accepts a valid create-workspace body",
      () => {
        const result =
          createWorkspaceSchema.safeParse({
            name: "Engineering",
          });

        expect(result.success).toBe(true);
      },
    );

    it(
      "rejects a create-workspace body over 120 characters",
      () => {
        const result =
          createWorkspaceSchema.safeParse({
            name: "a".repeat(121),
          });

        expect(result.success).toBe(false);
      },
    );

    it(
      "accepts a valid add-member body",
      () => {
        const result =
          addWorkspaceMemberSchema.safeParse({
            userId:
              "11111111-1111-4111-8111-111111111111",
            role: "viewer",
          });

        expect(result.success).toBe(true);
      },
    );

    it(
      "accepts a valid change-role body",
      () => {
        const result =
          changeWorkspaceMemberRoleSchema.safeParse({
            role: "administrator",
          });

        expect(result.success).toBe(true);
      },
    );

    it(
      "rejects a non-UUID workspaceId param",
      () => {
        const result =
          workspaceIdParamsSchema.safeParse({
            workspaceId: "abc",
          });

        expect(result.success).toBe(false);
      },
    );

    it(
      "accepts valid member params",
      () => {
        const result =
          workspaceMemberParamsSchema.safeParse({
            workspaceId:
              "11111111-1111-4111-8111-111111111111",
            userId:
              "22222222-2222-4222-8222-222222222222",
          });

        expect(result.success).toBe(true);
      },
    );
  },
);
