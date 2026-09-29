import type {
  PoolClient,
} from "pg";

import type {
  WorkspaceMembershipChangedPayloadV1,
  WorkspaceRole,
} from "@todo/contracts";

export interface InsertWorkspaceMembershipEventData {
  readonly eventId: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly role: WorkspaceRole | null;
  readonly changedAt: Date;
  readonly requestId: string;
}

export async function insertWorkspaceMembershipChangedOutboxEvent(
  client: PoolClient,
  data: InsertWorkspaceMembershipEventData,
): Promise<void> {
  const payload:
    WorkspaceMembershipChangedPayloadV1 = {
      workspaceId:
        data.workspaceId,

      userId:
        data.userId,

      role:
        data.role,

      changedAt:
        data.changedAt.toISOString(),
    };

  await client.query(
    `
      INSERT INTO outbox_events (
        id,
        aggregate_type,
        aggregate_id,
        event_type,
        event_version,
        payload,
        request_id,
        occurred_at,
        publish_attempts
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6::jsonb,
        $7,
        $8,
        $9
      )
    `,
    [
      data.eventId,
      "workspace-membership",
      data.workspaceId,
      "workspace.membership-changed",
      1,
      JSON.stringify(payload),
      data.requestId,
      data.changedAt,
      0,
    ],
  );
}