import {
  randomUUID,
} from "node:crypto";

import type {
  PoolClient,
} from "pg";

import type {
  AccountSessionRevokedPayload,
} from "@todo/contracts";

import {
  getRequestId,
} from "@todo/common";

/*
Shared by every repository that revokes a session (logout, refresh
reuse-detection, email change, password reset) so the gateway's
session-revocation cache learns about it without a synchronous call.

Must be called inside the same transaction as the session revocation
so the event never outlives, or precedes, the revoked_at commit.
*/
export async function insertSessionRevokedOutboxEvent(
  client: PoolClient,
  userId: string,
  sessionId: string | null,
  revokedAt: Date,
): Promise<void> {
  const payload:
    AccountSessionRevokedPayload = {
      userId,
      sessionId,
      revokedAt:
        revokedAt.toISOString(),
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
      randomUUID(),
      "session",
      sessionId ?? userId,
      "account.session-revoked",
      1,
      JSON.stringify(payload),
      getRequestId() ?? "unknown",
      revokedAt,
      0,
    ],
  );
}
