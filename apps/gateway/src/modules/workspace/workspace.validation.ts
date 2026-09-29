import {
  z,
} from "zod";

import {
  WORKSPACE_ROLES,
} from "@todo/contracts";

export const createWorkspaceSchema =
  z
    .object({
      name: z
        .string()
        .trim()
        .min(
          1,
          "Workspace name is required",
        )
        .max(
          120,
          "Workspace name must not exceed 120 characters",
        ),
    })
    .strict();

export type CreateWorkspaceInput =
  z.infer<typeof createWorkspaceSchema>;

export const addWorkspaceMemberSchema =
  z
    .object({
      userId: z.uuid(),
      role: z.enum(WORKSPACE_ROLES),
    })
    .strict();

export type AddWorkspaceMemberInput =
  z.infer<typeof addWorkspaceMemberSchema>;

export const changeWorkspaceMemberRoleSchema =
  z
    .object({
      role: z.enum(WORKSPACE_ROLES),
    })
    .strict();

export type ChangeWorkspaceMemberRoleInput =
  z.infer<typeof changeWorkspaceMemberRoleSchema>;

export const workspaceIdParamsSchema =
  z
    .object({
      workspaceId: z.uuid(),
    })
    .strict();

export const workspaceMemberParamsSchema =
  z
    .object({
      workspaceId: z.uuid(),
      userId: z.uuid(),
    })
    .strict();
