import type {
  WorkspaceRole,
} from "../authorization/index.js";

import type {
  EventEnvelope,
} from "../events/event-envelope.contract.js";

export interface WorkspaceMembershipChangedPayloadV1 {
  readonly workspaceId: string;
  readonly userId: string;

  /*
   * null means the user was removed from the workspace.
   */
  readonly role: WorkspaceRole | null;

  readonly changedAt: string;
}

export type WorkspaceMembershipChangedEventV1 =
  EventEnvelope<
    "workspace.membership-changed",
    WorkspaceMembershipChangedPayloadV1
  >;