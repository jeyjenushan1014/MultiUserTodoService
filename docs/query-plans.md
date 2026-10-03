# PF-10: real expensive-query execution plans

## Reproduce safely

From the repository root with Node.js 24 and Docker Compose available:

```powershell
npm run verify:query-plans
```

The command builds the production code with locked dependencies in the validation
image and starts only a fresh dedicated PostgreSQL 17 cluster. It uses the existing
Day-4 isolation checks (unique project, no host ports, no shared application volumes
or inherited database credentials). All discovered Todo migrations run on a new
scratch database. No application stack, mail provider, or public chain is contacted.
The scratch database, container, network and source snapshot are cleaned on exit.
The non-secret receipt persists at `.verification/<project>-result.json`.

For an immutable committed source after committing the implementation:

```powershell
npm run verify:day4 -- --ref HEAD --query-plans-only
```

The default convenience command snapshots the working tree; its receipt explicitly
does not claim committed-clean-clone proof.

## Dataset and coverage

- 100,000 tasks, 50,000 per owner; all four states and tied microsecond timestamps.
- 50,000 active shares, 5,000 withdrawn historical shares, 1,000 soft-deleted tasks.
- Due dates distributed across 1,000 days, with 20% NULL dates.
- Production indexes only; `VACUUM (ANALYZE)` refreshes statistics after seeding.
- 18 cases: owned/shared/all access x unfiltered/pending x first createdAt page,
  deep createdAt cursor, deep legacy dueDate offset. Page size is 20; deep boundaries
  are prepared at approximately 90% of independently computed eligible results.
- Both actual count SQL and actual list SQL are explained: **36 executed plans**.

The verifier invokes the compiled production `PostgresListTodosRepository` using
a real PostgreSQL pool. A forwarding wrapper records the SQL and bind parameters
that this repository actually emits. It does not copy the repository SQL, invent
result rows, or replace database execution with mocks. Expected IDs and counts
come from an independent set-union visibility query; all cases must agree.

For each captured SELECT, PostgreSQL executes:

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, FORMAT JSON) <production SELECT>
```

The receipt contains complete plans, SQL/binds and SQL hashes, PostgreSQL version
and planner settings, index definitions, discovered migrations, source snapshot
hash and compiled repository hash. Its summaries include execution/planning time,
actual/estimated rows, loops, filter removals, buffer hits/reads, temporary I/O,
index names and sequential scans. Plans missing actual execution or buffer data
fail, as do incorrect results or missing matching owned-keyset indexes.

## Interpretation and boundaries

Count queries still count the complete visible set even on deep keyset pages.
Owned keyset lists should use the owner/created composite index, or the
owner/state/created composite index when filtered. Shared/all visibility and
recipient JSON aggregation can require more scanning or correlated subplans.
The legacy dueDate path retains OFFSET and may sort/visit many rows; it is included
to expose that cost, not to claim it has keyset performance.

Buffer counts on a root include its descendants; do not sum node counts as though
they were independent I/O. `Actual Rows` is per loop, so inspect loops as well.
These measurements use warmed database buffers after correctness queries, not a
cold disk-cache benchmark. Sequential scans on broad count queries are reported,
not automatically treated as bugs. No planner flags or indexes are injected to
force a favorable plan.

PF-10 is execution-plan evidence, not an extra API latency objective or a claim of
maximum throughput. PF-4/PF-5 remain documented in [performance.md](performance.md).

## Accepted execution evidence

`npm run verify:query-plans` passed on **2026-10-03 at 15:49 UTC**, using PostgreSQL
**17.11**. All 18 result checks and 36 executed plans passed. Cleanup was verified:
no containers or networks remained for the accepted project.

- Receipt: `.verification/todo-day4-verify-1791042248086-e792affb0b-result.json`
- Receipt SHA-256: `86aee354ec468dc1b7f34c31122f7ef0d09adb148c8d81e317b21f838362bc5a`
- Base revision: `fc7e8e5be02c07684de653338b7b7ec526489197`
- Source snapshot SHA-256: `bb6d3d5eec93acd7642b3704aa023b32c1ee8ae52fd5a7af79322d702de1513d`
- Compiled repository SHA-256: `d857158697447de246861a17a6e54341164498bf90dd6709069c91e27db0c53e`
- Source kind: working-tree snapshot; **not** committed-clean-clone evidence.

The local receipt is generated evidence, not a tracked file. Retain/archive it with
the assessment; the measured summary below remains in this document, and the
command recreates complete plans with a new receipt identity on every run.

Execution times below are single warm-buffer `EXPLAIN ANALYZE` measurements in
milliseconds, not p95 API latency. "Hit blocks" and "Temp written" are the list
root's PostgreSQL buffer counts.

| Access | State | Mode | Depth | Count ms | List ms | Hit blocks | Temp written |
|---|---|---|---:|---:|---:|---:|---:|
| owned | unfiltered | first | 0 | 14.90 | 0.65 | 70 | 0 |
| owned | unfiltered | deep keyset | 44,540 | 9.15 | 1.66 | 70 | 0 |
| owned | unfiltered | dueDate offset | 44,540 | 15.47 | 2,193.96 | 183,573 | 0 |
| owned | pending | first | 0 | 4.23 | 2.02 | 71 | 0 |
| owned | pending | deep keyset | 10,800 | 3.92 | 1.88 | 70 | 0 |
| owned | pending | dueDate offset | 10,800 | 4.27 | 402.76 | 82,353 | 0 |
| shared | unfiltered | first | 0 | 177.58 | 495.34 | 2,601 | 0 |
| shared | unfiltered | deep keyset | 44,540 | 413.54 | 208.99 | 2,601 | 0 |
| shared | unfiltered | dueDate offset | 44,540 | 54.75 | 862.10 | 226,282 | 633 |
| shared | pending | first | 0 | 66.44 | 103.13 | 2,601 | 0 |
| shared | pending | deep keyset | 10,800 | 67.61 | 84.13 | 2,601 | 0 |
| shared | pending | dueDate offset | 10,800 | 69.98 | 311.35 | 57,582 | 0 |
| all | unfiltered | first | 0 | 111.06 | 441.80 | 3,270 | 0 |
| all | unfiltered | deep keyset | 89,100 | 123.40 | 25.48 | 1,025 | 0 |
| all | unfiltered | dueDate offset | 89,100 | 74.24 | 1,410.63 | 368,765 | 2,031 |
| all | pending | first | 0 | 51.10 | 92.68 | 3,629 | 0 |
| all | pending | deep keyset | 21,600 | 37.56 | 3.98 | 935 | 0 |
| all | pending | dueDate offset | 21,600 | 50.25 | 252.68 | 91,624 | 492 |

### Findings and decisions

1. **Owned keyset index verified.** Unfiltered first/deep pages used
   `idx_todos_owner_created_active`; pending pages used
   `idx_todos_owner_state_created_active`. Deep list buffer counts stayed at 70.
   Recipient aggregation also used `idx_todo_shares_active_authorization`.
2. **Total counts remain cardinality-dependent.** Keyset pagination bounds list
   retrieval, not the separate exact-count query. Count cost must not be hidden
   by presenting only list timings.
3. **Shared/all first pages are more expensive.** Shared plans used sequential
   scans of tasks/shares; all unfiltered first-page plans scanned tasks/shares
   and the small owner projection. Full plans include hashed/correlated subplans
   and sort/filter evidence. These costs are recorded, not silently omitted.
4. **Legacy dueDate OFFSET is not optimized by the keyset implementation.**
   Owned unfiltered deep dueDate used `idx_todos_owner_due_date_active` but still
   visited many rows; shared/all deep dueDate plans wrote temporary blocks.
   The 2,193.96 ms owned offset result is a real limitation, not a latency pass.
5. **No unrelated SQL/index rewrite in this evidence task.** Candidate follow-ups
   are shared-access set-union planning, bounded/optional exact counts, and a
   dueDate-compatible cursor/index. Those would need separate correctness and
   before/after plan validation. PF-10 completion proves measured plan evidence;
   it does not claim these optimizations have been implemented.

## Focused checks

```powershell
node --test scripts\__tests__\query-plan-evidence.test.mjs scripts\__tests__\verify-day4.test.mjs
```
