# Workspace membership projection (Redis)

This service maintains a local Redis projection of workspace memberships to allow fast, local
authorization checks without a synchronous call to Account Service.

Keys
- `workspace.membership:<userId>:<workspaceId>` — string role value (`administrator` / `editor` / `viewer`).
- `workspace.revoked:<userId>:<workspaceId>` — numeric epoch seconds representing `revoked-before` timestamp; presence means membership removed at that timestamp.

TTL
- Entries use `WORKSPACE_MEMBERSHIP_CACHE_TTL_SECONDS` (default configured in `env`, typical default 900s).

Example Redis keys and TTL (observability):

```
KEY: workspace.membership:29159e6a-3dc0-4415-ac22-d75aec4b3069:8a7f5e2a-... -> "editor" (EX 900)
KEY: workspace.revoked:29159e6a-3dc0-4415-ac22-d75aec4b3069:8a7f5e2a-... -> "169...'" (EX 900)
```

Semantics
- On `workspace.membership-changed` with `role` non-null: set `workspace.membership:<userId>:<workspaceId>` to the role and delete any `workspace.revoked` key.
- On `workspace.membership-changed` with `role` null: delete `workspace.membership...` and set `workspace.revoked...` to the event's `changedAt` epoch seconds.

Failure modes
- If Redis is unavailable, the projection lookups return `null` and services fall back to the conservative runtime behavior implemented in middleware. In this codebase the middleware intentionally "fails open" for missing projection data during the migration/backfill period to avoid accidental denial of service; once backfill and projection reach steady-state you may switch to a conservative fail-closed policy by editing the middleware.
- The consumer requeues events on transient failures to avoid data loss. Consumer logs include correlation `requestId` and the original outbox envelope id for traceability.

Backfill & verification
- Backfill script: `apps/todo-service/scripts/backfill-workspaces.mjs` (dry-run by default; `--apply` to perform updates). It queries the Account Service internal endpoint for each owner and sets `workspace_id` when unique. Ambiguous results are written to `ambiguous-backfill-<ts>.csv`.
- Internal Account Service endpoint used by backfill: `GET /internal/v1/accounts/:userId/workspaces` (internal-only, protected by `requireInternalService`).

Observability
- Consumers log `workspace.membership-changed` envelope id, event `changedAt`, and affected `(userId, workspaceId)` for traceability. Search logs for `workspace.membership-changed` to trace propagation.
