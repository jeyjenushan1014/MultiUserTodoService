# Day 4 Questions, Experiments and Decisions

Updated: 2026-10-03. This is the canonical Day 4 question list, not the Day 3 journal.
Earlier Day 4 activities are retained in [Questions.day4.md](Questions.day4.md).
Executable evidence and its limits are recorded in [traceability.md](traceability.md).

## 1. Which fixes matter before adding more features?

**Problem:** code and green unit tests were being mistaken for a deployed, proven pipeline.
The review identified absent chain workers, synthetic schema/replacement tests, lost concurrent
edits, stale migration counts and an incomplete question journal.

**Decision:** prioritize running the application pipeline, preventing lost updates, and testing
the real database and chain. Correct unsupported ticks instead of adding assertions that merely
repeat implementation strings. Keep external mail and public-chain writes out of automation.

**Why:** an omission declared honestly is better than a "Covered" claim that passes while its
database, migration, worker or chain is missing.

## 2. Why were queued chain records never submitted?

**Tried/reviewed:** compared package scripts, Compose services and operational documentation.
An indexer script existed, but neither worker had a default Compose service.

**Decision:** deploy two writers and two indexers with explicit resource bounds. Indexers
acquire a shared PostgreSQL advisory lock per polling cycle, so both stay running while only
one scans or rebuilds at a time. Writers claim real rows
with `SKIP LOCKED`, initialize the nonce row before locking it, and coordinate each submission
with a session advisory lock.

**Crash decision:** persist the nonce, public unsigned transaction fields and deterministic hash
before broadcasting. Recovery signs the identical request and reconciles receipts at the stated
confirmation depth. Do not persist a private key or use a fresh nonce to retry an uncertain send.
The crash verifier forwards to the real RPC, kills the real child worker after broadcast but
before acknowledgement, and requires the restarted writers to confirm the original hash.

**Limit:** confirmation/crash recovery is not an unconditional liveness guarantee. Automatic
fee replacement and audited chain-DLQ replay are not implemented; indefinitely stuck/dropped
transactions still require human reconciliation. BC-11 must not be fully ticked.

## 3. What is an independent migration test?

**Problem:** a mock pool returned expected rows regardless of PostgreSQL behavior. Checking
that `down` is exported does not prove the reversal runs or preserves compatible data.

**Decision:** run the actual migration runner on disposable databases, exercise real `up` and
`down` steps, discover migration counts at runtime, and use actual previous-code traffic around
an additive migration. Fail on SQL/HTTP/data errors. Never down-migrate the operator's database.

The real previous-code check is specifically the frozen previous GET repository behind
an HTTP adapter, not a full historical authenticated application or old-version writes.
Foundational table drops cannot preserve the removed data; guarded workflow reversals
must refuse populated incompatible state. These limits are part of the evidence.

**Why:** the observable result must come from PostgreSQL and production code, not rows defined
inside the assertion. Supporting mock unit tests are not evidence for EV-1/EV-2/EV-9/EV-10.

## 4. How do conflicting task edits avoid silently overwriting one another?

**Problem:** duplicate-title 409 responses were unrelated to concurrent modifications.

**Decision:** expose a task version and compare the caller's expected version inside the
mutation transaction. A stale caller receives a distinct conflict response and must reload
before deciding whether to retry. Test two real competing edits against the same observed
version, and verify both the winning state and the absence of a second update event/anchor.
The API compatibility and legacy-client policy are documented in [api.md](api.md).

## 5. How can records from a replaced contract still be verified?

**Problem:** the old EV-11 test mapped two invented rows without calling any production code.

**Decision:** retain old public addresses and deployment blocks in `CHAIN_PREVIOUS_CONTRACTS`,
index each deployment separately, and use the production projection repository to read across
addresses. Verification deploys two actual contracts, writes through the application writer,
rebuilds the replacement projection from real logs and reads both histories directly on chain.

**Limit:** this supports ABI-compatible replacements. ABI-changing upgrades need versioned
decoders and are deliberately not claimed.

## 6. Why is the personal-task workspace a shared sentinel?

**Decision:** `DEFAULT_PERSONAL_WORKSPACE_ID` is deliberately one reserved non-tenant UUID,
`00000000-0000-4000-8000-000000000001`, shared by all personal tasks on chain. It is not a real
workspace and never grants membership or permission. Off-chain personal tasks retain null
workspace IDs and owner authorization.

**Alternatives rejected:** an owner ID violates BC-2; hashing it does not make it anonymous;
a random per-person on-chain workspace creates permanent person-level correlation. Creating
a real tenant solely to satisfy the contract would invent membership semantics.

**Trade-off:** personal-task workspace grouping is intentionally unavailable on chain. The
sentinel discloses only that a task was personal, not which person's workspace it belonged to.

## 7. How is the signing key supplied without entering source or images?

**Decision:** mount an untracked `writer.key` read-only into chain writers using
`CHAIN_SECRET_DIR`. The signer validates its derived public address. The isolated verifier
generates a new throwaway key outside its source snapshot, funds it on the local chain and
cleans up its directory. Logs retain error classes rather than raw RPC/signing error objects.

**Why:** passing a key in Compose environment/config or baking it into a build makes accidental
disclosure much easier. The existing environment-key fallback is for compatibility only;
the documented Compose deployment uses a mounted file.

## 8. What remains special about real mail?

The operator reported a Brevo password-reset email and HTTP 204 token acceptance on 2026-10-02,
Free's 300/day allowance, personal-email signup without a card/company domain, and rotation of
the setup SMTP credential. Those are manual/operator-reported facts, not automated results.
Automated checks stay sink-only. The shared five-per-24-hour address quota and send/deletion
fences are separate from Brevo's account-wide daily limit.

Provider acceptance followed by worker death can still duplicate mail without provider-side
idempotency. Never call that pipeline exactly once.

## Deliberate omissions (rule 7)

These are **not completed requirements**, and adding code-shaped tests does not change that:

| Omitted or unproven work | Why left out / boundary |
|---|---|
| Automatic chain fee replacement and audited chain-DLQ replay; unconditional BC-11 liveness | Prioritize durable known-hash crash recovery and no duplicate application writes. Guessing a replacement nonce can permanently corrupt history. Human reconciliation remains required for indefinitely stuck transactions. |
| Public Sepolia application-pipeline demonstration | The existing public demo was a standalone synthetic script. Automated tests use disposable local chains; public writes require an explicit operator-controlled key, funds and manual demonstration. |
| ABI-changing contract replacement | Retaining compatible deployments is implemented; inventing a generic decoder without a real second ABI would be misleading. |
| Real provider refusal/throttling/outage proof (full ML-5) and live provider replacement (ML-6) | Avoid sending test mail to people or consuming a real provider quota. Sink failure/retry proof does not substitute for external-provider behavior. |
| Complete PR-1/PR-2/PR-4 across every Day 4 requirement and dependency | This remediation targets the review's specific unsupported evidence. The entire assessment still needs requirement-by-requirement behavioral review; no global tick is justified by the targeted checks. |
| PF-4/PF-5/PF-10 broad load objectives and large-data query evidence where still missing | Correctness, deployment and lost-update prevention take priority over performance claims without a reproducible dataset and measured thresholds. |

The broader uncovered groups remain in [traceability.md](traceability.md) and
[day-4-checklist.md](day-4-checklist.md). This list does not turn partial work into coverage.
Do not mark the assessment globally finished until every remaining requirement has its stated
observable proof.
