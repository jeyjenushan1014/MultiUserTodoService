# Distributed workflow plan and implementation

## Scope and chosen operation

The implemented operation is **workspace provisioning**. One authenticated request records a
durable operation and asynchronously establishes private reservation state in three independently
deployed services:

1. Account Service stores the workspace-name/owner reservation.
2. Todo Service stores the corresponding TODO-side reservation.
3. Gateway publishes the routing reservation in Redis.

Reservation rows and Redis hashes are internal. They are not workspace resources and no normal
read endpoint exposes them. The only public observation while work is incomplete is the truthful
workflow status resource. A client may treat the operation as available only after `completed`.
This visibility barrier is the answer to WF-2; it does not pretend that distributed writes are
atomic.

## State machine

`running -> completed` is the success path. An apply step that fails is scheduled again with a
bounded delay. Three failed apply attempts move the workflow to `compensating`. Compensation runs
in reverse order and ends in `compensated`. Three failures of one undo end in
`compensation_failed`; an operator can then see it at `GET /health/workflows`.

Each step has its own durable status, apply-attempt count, compensation-attempt count, last safe
error message and update timestamp. Workflow rows also store the correlation ID, current step,
next eligible attempt and a renewable worker lease. A process can stop after any write: after its
lease expires either worker claims it with `FOR UPDATE SKIP LOCKED` and continues from the stored
step state.

## Correctness decisions

- **Duplicate trigger:** `(owner_id, idempotency_key)` is unique. Repeating the request returns the
  original operation rather than creating another.
- **Two workers:** a time-bounded database lease gives one worker ownership; row claiming uses
  `SKIP LOCKED`. A crashed worker does not permanently own work.
- **Idempotent apply:** participant writes use `INSERT ... ON CONFLICT DO NOTHING` or overwrite the
  same Redis hash.
- **Idempotent undo:** participant deletes are no-ops when the reservation is absent. It is safe to
  compensate a participant whose apply response was lost or whose apply never committed.
- **No distributed transaction:** a repository update commits before each HTTP call. Participant
  calls own only their local statement. No PostgreSQL transaction spans HTTP, Redis or RabbitMQ.
- **Correlation:** the trigger request ID becomes the immutable workflow correlation ID. It is sent
  as `x-request-id` to every participant and included with `workflowId` and `workflowStep` in every
  orchestrator log.
- **Bounded failure:** apply and undo each permit three attempts. A terminal compensation failure
  is never retried forever.

## Detailed sequence

1. `POST /api/v1/workflows/workspace-provisioning` validates authentication, body and
   `Idempotency-Key`, persists the workflow plus all three step rows in one short local transaction,
   and returns `202` without doing remote work.
2. One workflow worker claims the row and applies `account-reservation`.
3. It applies `todo-reservation` through an authenticated internal request.
4. It applies `gateway-publication` through an authenticated internal request.
5. It marks the workflow `completed`. Until this write, only the status endpoint exposes progress.
6. On a permanent failure, the worker deletes possibly-created reservations in reverse order and
   records each successful undo.

## Manual verification

Run from a clean clone with the normal `.env` values configured:

```bash
docker compose up -d --build --scale workflow-worker=2
# Register/login using docs/api.md, then:
curl -i -X POST http://localhost:3000/api/v1/workflows/workspace-provisioning \
  -H 'authorization: Bearer <access-token>' \
  -H 'content-type: application/json' \
  -H 'idempotency-key: manual-workspace-001' \
  -d '{"workspaceName":"Manual verification"}'
curl -s http://localhost:3000/api/v1/workflows/<workflow-id> \
  -H 'authorization: Bearer <access-token>' | jq
curl -s http://localhost:3001/health/workflows | jq
```

Repeat the POST with the same key and confirm the same workflow ID. Stop both workflow workers
after at least one step (`docker compose stop workflow-worker`), wait longer than
`WORKFLOW_LEASE_MS`, restart them, and confirm the same workflow reaches a terminal state. To
exercise compensation, stop Todo Service for three eligible attempts; restart it before undo and
observe `compensated`. To exercise operator visibility, leave the required participant unavailable
during undo and confirm `/health/workflows` becomes `503` after
`WORKFLOW_COMPENSATION_STUCK_MS`.

## Evidence boundary

Automated unit checks replace the orchestrator instance while retaining durable-shaped state and
inject participant failures. They prove the state-machine decisions. The Docker commands above are
the manual process-level verification; a future destructive CI job should automate actual
container stops before claiming PR-4 for this workflow.

## Live proof recorded

The live Compose workflow proof was executed on 2026-09-30. An authenticated request created a
workspace-provisioning workflow; repeating the same `Idempotency-Key` returned the same workflow
ID. A subsequent status read showed `completed` with these applied steps:

```text
account-reservation: applied
todo-reservation: applied
gateway-publication: applied
```

The internal `/health/workflows` endpoint also responded successfully from inside Account Service.
This proves WF-1, WF-2, WF-6, WF-7, and the durable workflow state path. The additional live
compensation, boundary, and correlation proofs below cover WF-4, WF-5, WF-8, WF-9, and WF-10.

The WF-2 proof is automated by `npm run verify:workflow:wf2`. It stops Todo Service before
starting a workflow, confirms the workflow remains non-terminal, restores Todo Service with its
readiness gate, and confirms the same workflow reaches `completed` from durable state.

The WF-3 process-stop proof is automated by `npm run verify:workflow:wf3`. The Day 4 Compose
override pauses a claimed workflow before its first step, the proof stops both workflow workers
past the 30-second lease, restarts them, and verifies the same workflow reaches `completed`
without a caller retry.

Live WF-3 proof passed on 2026-09-30: both workflow workers were force-stopped during an active
step, replacement workers reclaimed the expired lease, and the workflow completed successfully.

Additional proofs:

```powershell
npm run verify:workflow:compensation
npm run verify:workflow:boundaries
npm run verify:workflow:correlation
```

`verify:workflow:compensation` stops Todo Service, verifies bounded retry and compensation,
checks the stuck-workflow health response, restores Todo Service, and verifies compensation
completion. `verify:workflow:boundaries` checks that local commits complete before participant
HTTP calls and that worker ownership uses `FOR UPDATE SKIP LOCKED`. The correlation proof checks
the request correlation ID across Account, Todo, Gateway, and workflow-worker logs.

## WF-2 failure-boundary proof

Run the live proof with:

```powershell
npm run verify:workflow:wf2
```

The proof stops Todo Service before triggering workspace provisioning, verifies that the workflow
remains `running` and no public workspace is visible, restarts Todo Service with its readiness
check, and verifies that the same durable workflow reaches `completed`. It fails if a half-applied
workspace becomes visible or if the workflow cannot resume after the participant returns.