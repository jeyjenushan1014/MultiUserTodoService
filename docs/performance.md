# PF-3/PF-4/PF-5 performance evidence

## One command

From the repository root, with Node.js 24 and Docker/Compose available:

```powershell
npm run verify:performance
```

Equivalent explicit command:

```powershell
npm run verify:day4 -- --working-tree --performance-only
```

This uses the isolated Day-4 source snapshot, fresh databases, actual service
replicas, Redis/RabbitMQ, sink-only mail and local chain. No application-stack
database is seeded and no public-chain/external-mail traffic is generated.
The command runs lint/build/unit/docs/authorization checks and then the targeted
PF-3/PF-4/PF-5 evidence flow on the live isolated stack. A failure exits non-zero;
receipt generation requires every targeted performance check to pass. This scoped
run does not claim full Day-4 migration-reversal or full Gateway E2E completion.
Generated credentials, containers, volumes, source and image aliases are cleaned
up. A non-secret dated receipt is saved at `.verification/<project>-result.json`.
Working-tree evidence is a source snapshot, not a committed-clean-clone claim.

## PF-3: database round trips through the actual list endpoint

`scripts/verify-round-trips.mjs` imports the compiled production Todo Express app
and uses real signed internal identities over loopback HTTP. It connects to the
isolated stack's migrated PostgreSQL and Redis, seeds 120 tasks and 120 real shares,
then exercises page sizes 1, 20 and 100.

The script wraps the real pg client's `query` solely to count calls; it forwards
every query to PostgreSQL unchanged. No mock client, invented result rows or
SQL-string-only assertion is used. There are no worker loops in this measuring
process; background work in other stack processes cannot enter its counter.
Measurement excludes seed/fixture SQL and includes actual endpoint middleware,
controller, cache and repository work.

Expected calls, independent of item count:

| Endpoint path | Calls | Meaning |
|---|---:|---|
| `access=all` | 4 | BEGIN, count, set-based list, COMMIT |
| `access=shared` | 4 | BEGIN, count, set-based list, COMMIT |
| `access=owned`, cache miss | 5 | Durable cache-version query plus the four list calls |
| `access=owned`, cache hit | 1 | Durable PostgreSQL cache-version check; cached list |

Calling the complete endpoint a four-query path would be inaccurate for owned
cache misses. PF-3 requires constant calls as result size grows, not four calls
in every cache mode. Gateway authentication is covered by live E2E; the SQL-count
evidence is specifically the production **internal list endpoint**, not a claim
about every endpoint in the system.

## PF-4: declared load and latency objectives

These limits are fixed in `scripts/performance/objectives.mjs` before measurement:

| Parameter | Objective / workload |
|---|---|
| Active authenticated virtual users | 20, one sequential request per user |
| Pacing | One request cycle every 2 seconds; maximum approximately 10 requests/s |
| Mix | 80% reads, 20% creates, distributed across users |
| Warm-up | 60 seconds, not included in percentiles |
| Measurement | 300 seconds |
| Dataset | 20,000 seeded tasks; 1,000 per caller, plus accepted warm-up/measured creates |
| Read | `GET /api/v1/todos?access=all&pageSize=20&sortBy=createdAt&sortOrder=desc` |
| Read p95 | <= 300 ms |
| Write | `POST /api/v1/todos`, unique title and idempotency key |
| Write p95 | <= 500 ms |
| Unexpected failures | <= 1% separately for reads/writes |
| Minimum samples | 2,000 reads and 500 writes |
| Incorrect responses/persistence | Zero allowed |

“20 users” means 20 active paced client loops, not 20 requests simultaneously
in flight at every instant or an open-loop saturation/maximum-throughput claim.
Traffic passes through the real edge/Gateway and real authentication. Read
`access=all` bypasses the Redis list cache; the objective does not hide SQL cost
behind cache hits. Setup uses real registration/login and waits for real owner
projection. Fixture rows are inserted into only the isolated database; measured
writes go through the actual API, database transaction, outbox and chain enqueue.
Background workers remain enabled.

Latency includes HTTP response completion and JSON decoding. Counts include
transport/timeouts and non-success HTTP statuses. The checker verifies list size,
owner isolation, pagination, returned create state, and persisted create title/
owner plus a durable chain submission after measurement. Chain confirmation and
mail delivery latency are deliberately not included in the write objective.
Results record p50/p95/p99, sample/error counts, request rate and actual duration.

## PF-5: fail-closed automatic threshold enforcement

`scripts/performance/evaluate.mjs` runs as a separate process over actual measured
data. Normal thresholds must return **exit 0**. Breached latency/error rate,
insufficient samples, invalid responses, wrong user count or incomplete duration
returns **exit 1**. Setup/runner failures also fail the orchestration.

After a passing measurement, the command feeds the **same actual measured data**
to that process with `--deliberate-breach`, setting both p95 limits to 0.001 ms.
It requires exit **1** and explicit read/write latency breach reasons. This is a
negative threshold-control test, not an injected slow database or production
fault. The command passes only when the normal run passes and this deliberate
breach is detected. No objectives are loosened in response to failed measurements.

Focused checker regressions:

```powershell
node --test scripts\__tests__\performance-objectives.test.mjs scripts\__tests__\verify-day4.test.mjs
```

## Acceptance status

Accepted isolated evidence run:

- Command: `npm run verify:performance`
- Date (UTC): 2026-10-03
- Receipt: `.verification/todo-day4-verify-1791039076330-7eb10846b2-result.json`
- Source kind: working-tree snapshot (`cleanCommittedSource=false`)

Measured results from the accepted receipt:

| Requirement | Outcome | Evidence |
|---|---|---|
| PF-3 | Passed | Real internal endpoint round trips were constant by size: `all/shared=4`, `owned miss=5`, `owned hit=1` for page sizes 1/20/100. |
| PF-4 | Passed | 20 users, 300s measured window, 20,000 seeded tasks. Read p95 `214.65 ms` (<=300), write p95 `179.88 ms` (<=500), read errors `0/2400`, write errors `0/600`, invalid responses `0`. |
| PF-5 | Passed | Automatic evaluator exited `0` on normal thresholds, and deliberate breach exited `1` with expected failures (`read: p95 objective breached`, `write: p95 objective breached`). |

This command is not PF-10 expensive query-plan evidence or a blanket completion
claim for all Day-4 requirements.
