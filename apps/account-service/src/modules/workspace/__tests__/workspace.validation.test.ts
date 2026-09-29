import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createWorkspaceSchema,
  addWorkspaceMemberSchema,
  changeWorkspaceMemberRoleSchema,
  workspaceIdParamsSchema,
  workspaceMemberParamsSchema,
} from "../workspace.validation.js";

describe(
  "createWorkspaceSchema",
  () => {
    it(
      "accepts a trimmed, non-empty name",
      () => {
        const result =
          createWorkspaceSchema.safeParse({
            name: "Engineering",
          });

        expect(result.success).toBe(true);
      },
    );

    it(
      "rejects an empty name",
      () => {
        const result =
          createWorkspaceSchema.safeParse({
            name: "   ",
          });

        expect(result.success).toBe(false);
      },
    );

    it(
      "rejects an unknown field",
      () => {
        const result =
          createWorkspaceSchema.safeParse({
            name: "Engineering",
            extra: "not allowed",
          });

        expect(result.success).toBe(false);
      },
    );
  },
);

describe(
  "addWorkspaceMemberSchema",
  () => {
    it(
      "accepts a registered role",
      () => {
        const result =
          addWorkspaceMemberSchema.safeParse({
            userId:
              "11111111-1111-4111-8111-111111111111",
            role: "editor",
          });

        expect(result.success).toBe(true);
      },
    );

    it(
      "rejects an unrecognized role",
      () => {
        const result =
          addWorkspaceMemberSchema.safeParse({
            userId:
              "11111111-1111-4111-8111-111111111111",
            role: "owner",
          });

        expect(result.success).toBe(false);
      },
    );
  },
);

describe(
  "changeWorkspaceMemberRoleSchema",
  () => {
    it(
      "accepts a registered role",
      () => {
        const result =
          changeWorkspaceMemberRoleSchema.safeParse({
            role: "viewer",
          });

        expect(result.success).toBe(true);
      },
    );
  },
);

describe(
  "workspaceIdParamsSchema",
  () => {
    it(
      "requires a UUID workspace id",
      () => {
        const result =
          workspaceIdParamsSchema.safeParse({
            workspaceId: "not-a-uuid",
          });

        expect(result.success).toBe(false);
      },
    );
  },
);

describe(
  "workspaceMemberParamsSchema",
  () => {
    it(
      "requires both ids to be UUIDs",
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
