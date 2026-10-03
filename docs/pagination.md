# Cursor pagination (PF-2)

## Implementation

The public Gateway validates/forwards `cursor` to Todo Service. Both services use
the same cursor contract. A `createdAt` first page fetches `pageSize + 1` rows and
returns `nextCursor` when necessary; subsequent pages seek by `(created_at, id)`.
The timestamp in the cursor preserves all six PostgreSQL fractional digits rather
than rounding to JavaScript milliseconds. Existing active-owner and
active-owner/state indexes support the owned-task seek. No new migration is needed.

The owned-list cache stores `nextCursor`, partitions by cursor/filters, and uses a
new pagination cache-key version to bypass old first-page entries lacking tokens.
Other access modes retain their existing cache bypass. Sorting by `dueDate` and
numbered pages remain compatible, offset-based paths. See [api.md](api.md).

## Verification commands

From the repository root in PowerShell:

```powershell
npm run build:packages
npm run build -w @todo/gateway
npm run build -w @todo/todo-service
npm run test -w @todo/todo-service -- list-todo.database-round-trips.test.ts list-todos.validation.test.ts list-todo.service.test.ts cached.list.todos.repository.test.ts cursor.cache.schema.test.ts redis.cursor.read-cache.test.ts --maxWorkers=2 --minWorkers=1
npm run test -w @todo/gateway -- todo-service.client.test.ts --maxWorkers=2 --minWorkers=1
npm run test:docs
```

Unit regressions are not real PostgreSQL or live API evidence.

### Real 100,000-row PostgreSQL check

This needs Docker and a built Todo Service. It starts only a dedicated PostgreSQL
17 container, generates a temporary password, publishes a random loopback port,
and removes only that named container and its anonymous volumes:

```powershell
$name = 'todo-pf2-check-' + [Guid]::NewGuid().ToString('N').Substring(0,12)
$password = [Guid]::NewGuid().ToString('N')
docker run -d --name $name -e "POSTGRES_PASSWORD=$password" -p '127.0.0.1::5432' postgres:17-alpine
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL container creation failed' }
try {
    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        docker exec $name pg_isready -U postgres *> $null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'PostgreSQL did not become ready' }
    $port = (docker port $name 5432/tcp).Split(':')[-1]
    $env:PF2_DATABASE_URL = "postgres://postgres:${password}@127.0.0.1:${port}/postgres"
    npm run verify:pagination
    if ($LASTEXITCODE -ne 0) { throw 'PF-2 verification failed' }
}
finally {
    Remove-Item Env:\PF2_DATABASE_URL -ErrorAction SilentlyContinue
    docker rm -f -v $name
}
```

Alternatively, set `PF2_DATABASE_URL` to a **dedicated** PostgreSQL cluster with
`CREATEDB` permission and run `npm run verify:pagination`. Never use a production URL.
The script creates/drops only its uniquely named scratch database. It executes the
six production migrations needed by the list repository, without cluster-global
operator roles; this is not a replacement for the complete migration verifier.
Bulk rows are seeded before cache-invalidation triggers, then remaining migrations
are applied. No cache or mocked database is involved.

The check verifies:

- 100,000 total tasks; 50,000 owned by the measured caller, and 50,000 tasks
  shared from the other owner. All four task states have populated datasets.
- All 30 combinations of `owned/shared/all`, unfiltered/all four state filters,
  and `asc/desc`. Each case independently verifies total count, first/next/deep
  page IDs against a SQL set-union expected result.
- Ascending/descending traversal equals independently queried PostgreSQL IDs,
  including tied timestamps and microsecond precision.
- Deep page results at 90% of each filtered list equal the independent SQL result:
  depth 45,000 for owned/shared unfiltered lists and 90,000 for all unfiltered.
- 20 items per request, five warm-up pairs and 50 measured samples per position,
  interleaving first/deep requests to reduce ordering bias.
- Fixed acceptance rule: **deep-page p95 <= first-page p95 * 2 + 20 ms**.
  This is a local PF-2 comparison, not the separate read/write PF-4 objective.
- Prints dated JSON evidence and exits non-zero on incorrect results or threshold
  failure. Save that output when updating checklist/traceability evidence.

The timing measures the complete production repository call, including its exact
count and transaction, not HTTP or Redis latency. It exercises all supported
`createdAt` access/state/direction combinations. No full-system PF-4/PF-5
concurrent load-test claim is made.

On 2026-10-03 the dedicated PostgreSQL 17 run passed: first-page p95 **79.07 ms**,
deep-page p95 **74.90 ms**, against the fixed **178.15 ms** comparison bound.
Both sort directions matched independent real database results with tied
microsecond timestamps. This result is repository-level, owned/unfiltered
evidence; the newly added HTTP/cache E2E check has not yet been executed.
This paragraph describes the earlier repository-only run; the complete proof below
supersedes its pending HTTP/cache status.

A final repeat at 11:31 UTC passed first-page p95 **32.44 ms**, deep-page p95
**29.32 ms** (bound **84.89 ms**), terminal-page checks and legacy numbered-page
results. Both temporary PostgreSQL containers/volumes were removed. The varying
absolute timings illustrate why each run records its own baseline and bound.
Builds and scoped lint passed; 30 Todo pagination/cache/validation tests plus two
Gateway client tests passed.

### Live HTTP/cache check

Against an updated, migrated running application stack:

```powershell
docker compose up -d --build gateway todo-service
npm run test:e2e -w @todo/gateway -- --testNamePattern="traverses cursor pages"
```

That test checks Gateway forwarding, distinct next-page items, repeated owned-list
responses, actual Redis storage of `nextCursor` and HTTP 400 validation. Set
`REDIS_URL` to the stack's Redis URL for that cache proof. A second test uses
dedicated registered users, real API creates/updates/shares, and traverses all 30
access/state/direction combinations while checking duplicates and caller isolation.
These tests require the existing E2E fixtures/setup and do not measure
large-dataset latency. Run both with:

```powershell
npm run test:e2e -w @todo/gateway -- --testNamePattern="traverses cursor"
```

### One isolated PF-2 evidence command

```powershell
npm run verify:day4 -- --working-tree --pagination-only
```

This uses the existing safe snapshot/unique-Compose-project verifier: no published
ports, throwaway secrets, actual service replicas, Redis/RabbitMQ, sink-only mail
and a local chain. It runs build/lint/unit checks, migrations and the complete
Gateway E2E suite, then the full PostgreSQL pagination matrix on the dedicated
evolution PostgreSQL cluster. Its receipt is saved as
`.verification/<project>-result.json`; it contains source revision/digest,
`scope: "PF-2"`, E2E status, every measured case and dated thresholds, not secrets.
Cleanup removes only its isolated stack, volumes, images and generated keys.

`--pagination-only` deliberately finishes before the unrelated operator replay/
DLQ/rollback rehearsals. It does not suppress a failure inside PF-2's build,
E2E or measurement steps and does not claim that all Day 4 requirements pass.
Omit the option for the complete aggregate verifier.

## Completed acceptance evidence

On **2026-10-03 at 12:46:50 UTC**, the one-command isolated PF-2 verification
returned exit code **0**, `result: "passed"`, `scope: "PF-2"` and
`liveGatewayE2ePassed: true`.

- Build, lint, unit/operational checks, API documentation and authorization passed.
- All **30 live Gateway E2E tests passed**, including both cursor tests. Actual
  Redis entries contained `nextCursor`; repeated cache-hit responses retained it.
  Real API registrations/creates/updates/shares verified all access/state/direction
  combinations, no duplicates and no unshared caller-data exposure.
- PostgreSQL 17: **100,000 tasks**, **50,000 owned**, **50,000 active shares**.
  Each case used 20 items, five warm-up pairs, 50 measured samples per position,
  and a precomputed deep cursor. Independent SQL IDs/counts verified correctness.
- The fixed rule remained **deep p95 <= first p95 * 2 + 20 ms** for every case.
  All **30/30** cases passed; no threshold was relaxed.
- Terminal pages, legacy numbered pages and tied microsecond timestamps passed.
- All isolated containers, named volumes, network, temporary image aliases/source
  and generated credentials/signing key were removed. The non-secret receipt remains.

Receipt: `.verification/todo-day4-verify-1791030802560-e1889a5a87-result.json`.
Source type: **uncommitted clean-source snapshot**, not a committed clean clone.
Base revision: `565f3350e3574f8e487e6692223bcbe331d47eac`.
Snapshot SHA-256:
`2fe50f8379265e732409b657179bbbf2e57fc6c09edaf714a943bb42f161668b`.
The receipt includes full-precision results; the table rounds milliseconds to two
decimal places. Documentation updated after the run is not part of that digest.

| Access | State | Direction | Eligible | Deep offset equivalent | First p95 ms | Deep p95 ms | Limit ms |
|---|---|---|---:|---:|---:|---:|---:|
| owned | unfiltered | asc | 50,000 | 45,000 | 32.53 | 35.34 | 85.05 |
| owned | unfiltered | desc | 50,000 | 45,000 | 22.95 | 22.14 | 65.90 |
| owned | pending | asc | 12,500 | 11,250 | 7.88 | 6.70 | 35.75 |
| owned | pending | desc | 12,500 | 11,250 | 8.66 | 10.27 | 37.33 |
| owned | in_progress | asc | 12,500 | 11,250 | 12.75 | 10.86 | 45.51 |
| owned | in_progress | desc | 12,500 | 11,250 | 14.54 | 15.73 | 49.08 |
| owned | completed | asc | 12,500 | 11,250 | 10.21 | 11.33 | 40.42 |
| owned | completed | desc | 12,500 | 11,250 | 10.00 | 11.97 | 39.99 |
| owned | cancelled | asc | 12,500 | 11,250 | 15.21 | 13.47 | 50.41 |
| owned | cancelled | desc | 12,500 | 11,250 | 22.44 | 18.76 | 64.88 |
| shared | unfiltered | asc | 50,000 | 45,000 | 306.31 | 122.28 | 632.61 |
| shared | unfiltered | desc | 50,000 | 45,000 | 426.12 | 385.42 | 872.25 |
| shared | pending | asc | 12,500 | 11,250 | 127.19 | 73.27 | 274.38 |
| shared | pending | desc | 12,500 | 11,250 | 169.58 | 143.15 | 359.15 |
| shared | in_progress | asc | 12,500 | 11,250 | 226.62 | 142.23 | 473.24 |
| shared | in_progress | desc | 12,500 | 11,250 | 315.11 | 441.53 | 650.22 |
| shared | completed | asc | 12,500 | 11,250 | 212.12 | 106.99 | 444.24 |
| shared | completed | desc | 12,500 | 11,250 | 254.44 | 228.09 | 528.87 |
| shared | cancelled | asc | 12,500 | 11,250 | 91.16 | 49.71 | 202.33 |
| shared | cancelled | desc | 12,500 | 11,250 | 226.79 | 161.78 | 473.57 |
| all | unfiltered | asc | 100,000 | 90,000 | 473.01 | 192.70 | 966.03 |
| all | unfiltered | desc | 100,000 | 90,000 | 575.98 | 133.11 | 1,171.96 |
| all | pending | asc | 25,000 | 22,500 | 288.92 | 140.90 | 597.84 |
| all | pending | desc | 25,000 | 22,500 | 257.49 | 106.20 | 534.99 |
| all | in_progress | asc | 25,000 | 22,500 | 434.40 | 231.25 | 888.80 |
| all | in_progress | desc | 25,000 | 22,500 | 519.76 | 157.41 | 1,059.51 |
| all | completed | asc | 25,000 | 22,500 | 296.70 | 163.74 | 613.41 |
| all | completed | desc | 25,000 | 22,500 | 288.83 | 107.15 | 597.66 |
| all | cancelled | asc | 25,000 | 22,500 | 321.49 | 181.57 | 662.99 |
| all | cancelled | desc | 25,000 | 22,500 | 287.19 | 101.45 | 594.38 |

The first complete rehearsal passed the real tests/matrix but failed while forming
the receipt because `node:assert/strict` was not imported. That import was fixed;
the entire isolated command above was rerun successfully, not just relabeled.
PF-2 is now checked in [day-4-checklist.md](day-4-checklist.md) and covered in
[traceability.md](traceability.md). PF-3/PF-4/PF-5/PF-10 remain separate requirements.
