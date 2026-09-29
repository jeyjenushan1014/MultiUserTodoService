# Workspace membership projection (Redis)

This service maintains a local Redis projection of workspace memberships to allow fast, local
authorization checks without a synchronous call to Account Service.

Keys
- `workspace.membership:<userId>:<workspaceId>` — string role value (`administrator` / `editor` / `viewer`).
- `workspace.revoked:<userId>:<workspaceId>` — numeric epoch seconds representing `revoked-before` timestamp; presence means membership removed at that timestamp.

TTL
- Entries use the same TTL as session-revocation cache: `SESSION_REVOCATION_CACHE_TTL_SECONDS` (default 900s).

Semantics
- On `workspace.membership-changed` with `role` non-null: set `workspace.membership:<userId>:<workspaceId>` to the role and delete any `workspace.revoked` key.
- On `workspace.membership-changed` with `role` null: delete `workspace.membership...` and set `workspace.revoked...` to the event's `changedAt` epoch seconds.

Failure modes
- If Redis is unavailable, services fail open: authorization checks that rely on the projection fall back to allowing requests (bounded by TTL and token expiry).
- The consumer requeues events on transient failures to avoid data loss.
