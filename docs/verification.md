# Isolated operations verification

Run from the repository root:

```powershell
node --test scripts\__tests__\rollback-release.test.mjs scripts\__tests__\verify-day4.test.mjs
npm run verify:rollback
npm run verify:day4 -- --clean-clone
# Before committing coordinated changes, explicitly validate a source snapshot:
node scripts\verify-day4.mjs --working-tree
# Focus on the requested operational commands while source changes are uncommitted:
npm run verify:day4 -- --working-tree --operations-only
```

The default verifier requires the verifier, helpers, and `verify-operations.mjs`
to be **committed** in the selected revision. Uncommitted changes are deliberately
not copied or tested in that mode. The explicit `--working-tree` option instead
clones HEAD and overlays Git-tracked current files and allowlisted non-ignored new
source files into isolated scratch (without creating any commits),
excluding local environment files, secrets, dependencies, build outputs and
credential/key/backup files. Deleted tracked files stay deleted, and symbolic
links are refused. The receipt identifies this as an
**uncommitted clean source snapshot**, records its source digest and base commit,
and sets `cleanCommittedSource` to false. It is not a historical release clone or
proof of a committed revision. Do not combine `--working-tree` with `--ref`.
`--clean-clone` selects only committed source and is the documented full-verification command.
Wait until coordinated source changes are complete before taking the snapshot.
Neither mode runs `npm ci` in the shared working directory; locked dependencies
are intentionally installed only in the disposable Docker build.

Requires Git, Docker, Compose 2.24.4+ (`!reset` support), network
access for locked npm dependencies and image downloads, and a host Node version
supporting native fetch. Builds/tests execute with Node 24 inside Docker.

The verifier clones that immutable revision below `.verification`, uses an explicit
unique Compose project and empty env file, creates ephemeral database/broker/JWT
credentials, mounts an empty mail-secret directory, and forces sink-only mail.
The main isolated stack publishes no host ports; the separate Mailpit fixture
uses temporary Docker-assigned test ports and removes them with its project.
The existing default stack, host `node_modules`,
`.env`, database volumes, and chain node are never reset or reused. Do not invoke
legacy live verifiers separately against your default stack as a substitute.

RabbitMQ healthchecks and the mail verifier's startup diagnostic run as `rabbitmq`, not root. This prevents
the diagnostic client from creating a root-owned Erlang cookie while the broker
is still starting on a fresh volume. The Compose definition and isolated overlay
use the same broker-user check. No already-running broker was recreated and no
existing cookie was read or changed.

Gateway dependency readiness is polled for up to two minutes after infrastructure,
workers and historical-schema checks. A transient startup response is not a pass:
the endpoint must actually return HTTP 200 and `healthy`. Persistent degradation
fails with its dependency status in the retained redacted diagnostic.

Each command has a deadline (at most ten minutes, or twenty for the full validation-image build); the aggregate has a 60-minute budget, with separately bounded rollback rehearsal and cleanup. Checks include lint/build/unit
tests, Solidity contract tests, API/authorization/traceability checks, migration up/down
tests, two-instance topology, live E2E, measured endpoint round trips and load thresholds,
workflow crash/retry unit coverage, account/Todo lifecycle tests, workspace concurrency
and repeated backfill dry-runs, repeated chain projection rebuild, operator replay/DLQ/progress
rehearsals, and retained-image rollback mechanics.

The full scope is `npm run verify:day4` on the committed source. It builds the isolated
validation image with locked Solidity-project dependencies and explicitly requires two
running replicas for every stateless service and worker before E2E. It runs the actual
contract test suite, migration reversal/historical-code suite, mail failure tests, workflow
restart/retry unit tests and PF-3/PF-4/PF-5 measurement checks. Its receipt records each
passed gate, replica counts and load measurements. The `--operations-only` and
`--performance-only` shortcuts do not claim the full Day 4 scope.

`npm run verify:traceability` validates the exact rows for the 42 requirement identifiers
requested in the current checklist, verifies each listed root npm script exists, and
rejects duplicate/missing rows or a claimed check on an `Uncovered` row. It reports gaps
as gaps; a passing traceability-structure check is not evidence that every requirement is
implemented. The eight deliberate-breakage record (PR-8), complete documentation behavior
checks, and repeated-run equivalence automation remain open and are identified in
`docs/traceability.md`.

Run the aggregate twice, as separate invocations, to demonstrate clean-state isolation.
Each run has a unique Compose project, generated config and ephemeral credentials, and
removes only its own Compose resources. Do not run `docker compose down -v` against the
default project: that can delete non-verification database state. The full receipt includes
random run identifiers and measured timings, so equivalence means all required gates pass
against the same committed revision, not byte-for-byte identical result files.

The local mail checks explicitly run `verify-mail-mode.mjs`,
`verify-notification-retry.mjs`, and `verify-notification-quota.mjs` inside Account
with sink-only delivery. The mode test exercises audited mode changes and the
external kill switch without contacting an external provider. After the operator
rehearsal restarts its consumers, the verifier again waits for all six queues to
drain and the chain reader to be caught up. Captured operator/mail diagnostics
redact ephemeral credentials and URLs; the success receipt contains neither.

The aggregate command also runs the isolated Mailpit stop/restart/retry/DLQ proof,
before starting its main infrastructure, so the two fixture stacks do not run
concurrently. The mail verifier uses an explicit base Compose file and empty env
file, fresh credentials and consistently regenerated connection URLs, and unique
release tags. It never inherits parent/deployment database or broker URLs. It
builds each shared service image once before starting workers, avoiding competing
builds of the same tag, and removes its five temporary image aliases on cleanup.
The mail-only fixture has an unavailable local-only chain endpoint; it does not
start chain workers or contact a public RPC.
The aggregate command then runs
the three-consumer DLQ and targeted owner/history replay rehearsal, and OP-8 against
newly-created scratch databases in the disposable Compose project. OP-8 creates real
short-lived restricted login roles, verifies denied raw table access and exercises
append-only break-glass audit records; it neither applies migrations nor provisions
identities on a live deployment. The scratch database volume and generated credentials
are removed with the isolated project.
The scratch databases are restored from the freshly migrated disposable service
databases, preserving their routines and grants without re-creating PostgreSQL
roles that are cluster-global. Nonempty user/task counts and the dump catalogue
are checked before restricted-login rehearsals; scratch databases are dropped
afterward. Build inputs are cached separately from operator scripts and docs,
so a documentation-only update does not recompile all five workspaces.

`--operations-only` retains real migrations, Gateway E2E, mail-mode/retry/quota,
three-DLQ and owner/history replay, broker outage/recovery, repeated rebuilds,
progress, restricted-login scratch checks, nonempty scratch backup/restore, and
rollback. It skips the exhaustive migration reversal/historical-code suite,
full chain fault suite, and the separate Mailpit outage stack. Those skipped
checks are not claimed by an operations-only receipt. Use `--clean-clone` instead
of `--working-tree` after the coordinated changes have been committed to verify
the actual committed source; these options are mutually exclusive.

Public-chain transactions, external mail-provider delivery, live identity provisioning,
database restore into a live target, and real incident break-glass actions require
separate approvals and remain outside this local automated scope.

The operator rehearsal runs on the host from the isolated clone or source snapshot. It receives
the ephemeral verification environment, isolated-project guards, both Compose
file selectors, and the empty env-file selector. Its Docker commands execute
probes and operator scripts inside their respective service containers; no
cross-service compiled-code image, Docker socket mount, or root scripts copied
into production images are needed. The production Dockerfile remains unchanged.
After the local contract deployment and repeated real indexer rebuild, the verifier
requires all six consumers to be present and drained and the persisted chain-reader
checkpoint to be caught up (`ops:progress --require-ready`); liveness alone cannot
pass this check.

The isolated Anvil node deploys **committed local deployment bytecode as a fixture**,
checks deployment success/address/block and runtime code, and mines a confirmation.
It does not prove a new Solidity build or validate a public deployment. Anvil's
well-known test accounts are local fixtures, never production signing credentials.

The rollback rehearsal starts three isolated fixture replicas using two distinct
tags of the **same built image**, verifies the actual Docker image-reference switch,
and forces a failed health probe to verify restoration of all current replicas.
This demonstrates mechanics, **not historical release or schema compatibility**.
It deletes only its unique tags and project. Production rollback still requires
two retained, schema-compatible release images and an identified operator.

Automatic cleanup removes only verification containers, networks, volumes, unique
runtime tags and clone scratch. A non-secret success receipt remains under
`.verification`. Add this directory to the repository ignore rules.

For inspection, `--keep` retains only this isolated project and clone. The final
output prints a cleanup command using a generated **secret-free**
`cleanup.compose.json`; run it before deleting the scratch directory. The same
cleanup manifest is retained if automatic teardown fails. Container inspection
still requires trusted Docker-administrator access and can reveal ephemeral
credentials. No verification credential file is saved.

For production rollback, `rollback-release.mjs` honors the normal explicit
`COMPOSE_FILE` and `COMPOSE_PROJECT_NAME` environment selectors. It refuses a mixed,
stopped or mislabeled current deployment; preserves its actual replica count;
uses locally retained images without builds/pulls/dependency changes; verifies
each replica's image reference, image ID, running state and available healthcheck;
and restores/verifies the declared current release on any application or health
failure. Failure to restore is reported distinctly for operator intervention.
