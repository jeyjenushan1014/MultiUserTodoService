# Operations

## Account lifecycle controls (DG-1 through DG-10)

### Export

Use `GET /api/v1/users/me/export` with a valid bearer token. The response is assembled from both
data owners and excludes passwords, token values, JWTs, and service secrets. A non-2xx response
is not a partial export.

### Deletion and verification

Deletion is asynchronous and requires an `Idempotency-Key`:

```powershell
curl.exe -X DELETE http://localhost:3000/api/v1/users/me -H "Authorization: Bearer $TOKEN" -H "Idempotency-Key: $KEY"
```

After completion, run:

```powershell
npm run verify:account-lifecycle
docker compose exec -T todo-service node apps/todo-service/scripts/verify-account-erasure.mjs <deletion-request-id> <user-id> <email>
```

The verifier covers both databases, Redis, all configured queues/DLQs, and chain logs. A failed
check means the account is not fully erased. Restore the unavailable dependency and let the
leased worker retry; do not delete rows manually. Repeating the same idempotency key is safe.

Personal unshared TODOs and account-linked queue messages are removed. Shared workspaces and
shared TODOs remain for other members, with retained history anonymized. Public chain history is
immutable and opaque; only local pending/projection references for deleted personal TODOs are
removed.

### Retention cleanup

The replicated `account-cleanup-worker` runs bounded transactional batches. Configure lifetimes:

| Data | Setting | Default |
|---|---|---:|
| Expired/revoked sessions | `SESSION_RETENTION_SECONDS` | 2,592,000 (30 days) |
| Used/expired refresh and reset tokens | `TOKEN_RETENTION_SECONDS` | 2,592,000 (30 days) |
| Published account outbox events | `OUTBOX_RETENTION_SECONDS` | 2,592,000 (30 days) |
| Completed notification deliveries | `NOTIFICATION_RETENTION_SECONDS` | 2,592,000 (30 days) |

Cleanup never removes active sessions, unused refresh tokens, processing deliveries, or
unpublished outbox events.

## Workspace-launch Activity 2/3 manual verification

```bash
docker compose up -d --build --scale workspace-launch-worker=2
docker compose ps workspace-launch-worker
```

Trigger `POST /api/v1/workflows/workspace-launch` as documented in `docs/api.md`. Before completion,
direct normal workspace/Todo reads must return the same not-found response as a missing resource.
After the membership projection arrives, both become visible together.

To verify process resume, stop both workers after a step log, wait longer than
`WORKFLOW_LEASE_MS`, and restart them:

```bash
docker compose stop workspace-launch-worker
sleep 31
docker compose start workspace-launch-worker
docker compose logs workspace-launch-worker | grep '<workflow-id>'
```

Expected: previously applied steps are not applied again; an `applying` step may be safely retried;
the same workflow reaches completion without a second client trigger.

The same scenario is automated by `npm run test:workflow-resume`: it starts the stack, pauses Todo
Service to hold the workflow during its second step, sends `SIGKILL` to both workers, unpauses Todo,
waits for lease expiry, restarts two workers, and fails unless the original workflow becomes an
accessible workspace and its correlation can be found in worker logs. It is safe for a clean clone
and uses a unique test account and idempotency key on every run.

## Rebuilding Projections (OP-1, BC-6)

### 1. Chain Projection Rebuild (BC-6, OP-1)
Rebuilds the local relational copy of what is on chain (`task_chain_events`, `chain_projection_blocks`,
and `chain_projection_checkpoints`) from the configured contract on the blockchain.

```powershell
npm run rebuild:chain-projection
```
* **What it does:** Clears existing projection tables for `(CHAIN_ID, TASK_HISTORY_CONTRACT_ADDRESS)` and scans all canonical event logs starting from `TASK_HISTORY_DEPLOYMENT_BLOCK` up to the current confirmed safe head (`latestBlock - CHAIN_CONFIRMATIONS + 1`).
* **Safety:** Atomic database operations within transactions. Safe to execute while the application is live. Does not touch or mutate on-chain state or tasks table.
* **Verification:** Produces structured log output: `Cleared local chain projection; rebuilding from deployment block` followed by `Chain projection rebuild completed`.

### 2. Workspace Backfill Rebuild (TN-11, OP-1)
Rebuilds or backfills workspace membership onto unassociated TODO items.
```powershell
docker compose exec -T todo-service node apps/todo-service/scripts/backfill-workspaces.mjs --account-url http://account-service:3001 --internal-key "$INTERNAL_SERVICE_SECRET" --apply
```
