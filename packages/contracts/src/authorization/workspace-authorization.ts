export const WORKSPACE_ROLES = [
  "administrator",
  "editor",
  "viewer",
] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const WORKSPACE_ACTIONS = [
  "workspace.read",
  "workspace.update",
  "workspace.delete",
  "member.list",
  "member.add",
  "member.change-role",
  "member.remove",
  "task.create",
  "task.read",
  "task.update",
  "task.delete",
] as const;

export type WorkspaceAction = (typeof WORKSPACE_ACTIONS)[number];

type PermissionTable = Readonly<
  Record<WorkspaceRole, Readonly<Record<WorkspaceAction, boolean>>>
>;

export const WORKSPACE_PERMISSIONS = {
  administrator: {
    "workspace.read": true,
    "workspace.update": true,
    "workspace.delete": true,
    "member.list": true,
    "member.add": true,
    "member.change-role": true,
    "member.remove": true,
    "task.create": true,
    "task.read": true,
    "task.update": true,
    "task.delete": true,
  },
  editor: {
    "workspace.read": true,
    "workspace.update": false,
    "workspace.delete": false,
    "member.list": true,
    "member.add": false,
    "member.change-role": false,
    "member.remove": false,
    "task.create": true,
    "task.read": true,
    "task.update": true,
    "task.delete": true,
  },
  viewer: {
    "workspace.read": true,
    "workspace.update": false,
    "workspace.delete": false,
    "member.list": true,
    "member.add": false,
    "member.change-role": false,
    "member.remove": false,
    "task.create": false,
    "task.read": true,
    "task.update": false,
    "task.delete": false,
  },
} as const satisfies PermissionTable;

export function canPerform(
  role: WorkspaceRole,
  action: WorkspaceAction,
): boolean {
  return WORKSPACE_PERMISSIONS[role][action];
}