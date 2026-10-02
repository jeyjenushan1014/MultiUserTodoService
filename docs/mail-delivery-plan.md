# Day 4 Mail Delivery Implementation Plan

Status: Stages 1, 2, 4 and the Stage 5 sink-only outage/replay proof verified
on 2026-10-02; Stage 3 mail-side quota verified separately. A real external
provider/inbox send, provider throttling proof, and the deployed legacy
deletion workflow remain open.
Scope: ML-1 through ML-8, including the Day 3 notification and password-reset behavior.

## Current baseline and constraints

- Account Service consumes `todo.shared`, `todo.share-withdrawn`, and
  `account.password-reset-requested`; the worker uses Mailpit SMTP by default.
- Shared and withdrawn mail resolve the recipient's current account email; reset mail
  compares the event address with the current account address. Missing or deleting
  recipients do not receive a message.
- Delivery claims are stored by event ID, with a five-minute processing lease. A crash
  after provider acceptance but before `markSent` can send a duplicate on recovery.
- A failed send is retried at 30 and 60 seconds via the durable
  `todo.notifications.retry` queue; after the third failed attempt it enters
  `todo.notifications.dlq`. Retry attempts travel in `x-notification-attempt`.
  PostgreSQL claims fence concurrent workers and record `retry_pending` and
  `dead_letter_pending` before publish. Broker confirmation and terminal DB
  finalization precede acknowledgement of the original. The repository can
  recover an expired five-minute lease or an unacknowledged original after a
  process stop. Repeated broker messages may exist, but only the expected
  attempt can claim the event; a send accepted immediately before a worker
  crash can still be duplicated after its lease expires.
- `apps/account-service/scripts/verify-notification-retry.mjs` proves the
  PostgreSQL race, lease recovery, bounded states, RabbitMQ TTL routing and
  isolated DLQ replay without sending mail. `npm run verify:mail` now stops
  Mailpit during a real password-reset request, observes retries and DLQ,
  restarts Mailpit, and confirms replay in its local sink.
- Gateway request limits are per caller, not per destination address. Compose passes
  SMTP host/from as environment values at startup; changing them requires restarting.
- PostgreSQL `notification_address_reservations` admits at most five distinct
  event IDs per normalized address in a rolling 24-hour window. A retry reuses
  its reservation. Account deletion cascades reservations; hourly cleanup removes
  reservations after 24 hours. The recipient's advisory session lock spans
  address lookup and send; account deletion requests and email changes acquire
  the matching transaction lock before their user mutation.
- The existing running account database records an older, incompatible 011
  deletion migration. The 012 quota and 013 transport migrations were applied individually after
  a dry run; `verify-notification-quota.mjs` tested the mail-side fence against
  a temporary pending request. It does not prove the deployed deletion endpoint
  or the full erasure verifier, which still require a separate schema reconciliation.
- Automated runs must remain sink-only even if the operator has external credentials.
- Stage 4 uses one PostgreSQL mode row shared across notification replicas and a
  per-event `destination` that is pinned on first attempted send. The operator
  command is Docker-only and records each mode change without storing credentials.
  Worker Compose defaults to `MAIL_TEST_SINK_ONLY=true`; a prepared deployment
  may turn this guard off once, then switch sink/external without redeployment.
  Turning external mode off never sends a pinned external event to Mailpit;
  it is retried and eventually set aside in the DLQ. A pinned sink event stays
  in Mailpit even if the shared mode changes to external. Provider SMTP username
  and password are read only from a read-only mounted file when needed.

## Delivery design to implement

1. Keep notification decisions in the existing producers and the three message formats.
   Keep the existing `NotificationMailer` boundary; introduce a transport selector under
   it so business rules do not name a provider. Mailpit remains the default and the only
   automated-test transport. Add an external SMTP adapter using a verified sender on a
   free-tier account controlled by the operator. Brevo free SMTP is the first candidate;
   before selecting it, verify current signup, sender verification, daily quota, card,
   and domain rules without purchasing anything. If it fails the no-card/no-domain gate,
   use another qualifying provider with the same adapter contract. Never use production
   addresses for the demonstration except an inbox controlled by the operator.
2. Add an operator-only runtime control backed by shared state (Redis or an existing
   persisted settings store), not per-process environment switching. Expose a read-back
   status command and an authenticated, audited on/off command. Default to `sink` when
   unset, after restart, and when shared settings cannot be read; external delivery must
   require an explicit enable and a validated external configuration. Both notification
   replicas read the effective state per send; reject external mode in tests and in the
   one-command verification environment. A switch must not silently route an old queued
   message to the newly selected destination: pin the destination at first delivery
   claim and preserve it on retry, or explicitly drain before switching. Verify that
   external mode cannot be enabled with an unverified sender or missing credentials.
3. Supply provider credentials only at runtime outside version control and images,
   preferably via a mounted secret file (not a Compose substitution or `docker inspect`
   environment variable). Never store credential values in database rows, events, DLQs,
   logs, or error text. Validate the configured file on enable; redact provider errors
   before logging or recording `last_error`. Document rotation and missing-secret
   behavior. No credentials are required to start in sink mode.
4. Re-check that the recipient is an active registered account immediately before each
   send; never trust a broker email address as authorization to send. Keep queued-mail
   erasure behavior and add a concurrency fence between account deletion and dispatch
   so a deleted recipient cannot be sent queued mail after deletion commits. Persist a
   per-normalized-address quota shared across both workers: proposed initial policy is
   at most 5 externally attempted messages per rolling 24 hours. Count a logical event
   once, including retries, using a unique event reservation; enforce the bound
   atomically with SQL or Redis scripting, and define retention and account-erasure
   cleanup without storing a reusable credential or unnecessary personal data. Delay
   over-quota deliveries until the window opens (or set them aside with an operator
   reason); never send over quota. Apply the same address check in sink mode.
5. Add bounded, delayed notification retries with explicit max attempts and backoff,
   then route permanently failing sends to the existing notification DLQ with sanitized
   diagnostics. Provider refusal, 429/rate limit, timeouts, and network failure must
   leave the originating task/reset operation successful. Honor `Retry-After` when
   exposed and bounded; prevent a hot retry loop and keep prefetch/concurrency limits
   calculated in `docs/capacity.md`. Re-check recipient, erasure state, destination,
   and quota on every attempt. Acknowledgement, crash recovery, and DLQ replay must not
   bypass the quota or resend to an erased account. Treat a timeout as unknown provider
   outcome; without provider idempotency, exact-once external delivery cannot be
   promised. Prefer provider message idempotency if supported, otherwise document and
   test the possible duplicate and keep the message body non-sensitive where possible.

## Implementation order and acceptance gates

| Stage | Change and proof | Requirements |
|---|---|---|
| 1 (done) | Refusal/timeout regression tests added and now pass; invalid events still dead-letter without retry. | ML-5 (partial), ML-8 |
| 2 (done) | Durable retry queue, confirmed publish, fenced PostgreSQL claims, terminal DLQ handoff and operator replay; unit tests plus live DB/RabbitMQ verifier passed. | ML-5 (partial), ML-8 |
| 3 (mail-side done; erasure gate open) | Active-account lookup, atomic address quota and account/email-change fence; live two-worker database proof and lifecycle unit suite passed. Full erasure verification blocked by legacy deployed deletion schema. | ML-7 (partial), DG-10 (partial), ML-8 |
| 4 (implemented; real-provider gate open) | PostgreSQL runtime switch and audit, provider-neutral SMTP adapter, mounted secret, pinned destination and kill switch; unit and live sink-only shared-state proofs passed. An external provider has not been qualified or sent mail. | ML-3 (partial), ML-4 (partial), ML-6 (partial), OP-7 (partial), ML-8 |
| 5 (sink-only proof done) | `npm run verify:mail` runs 34 mail unit tests, starts an isolated two-consumer stack with forced Mailpit/blank provider configuration, stops Mailpit during a real reset request, observes two retries and DLQ, restarts it, and confirms local replay. Real-provider refusal/throttling remains a separate Stage 6 proof. | ML-5 (local path covered; external pending), ML-8, PR-4 (mail dependency) |
| 6 | Only after all sink-mode gates pass, qualify a no-card/no-domain free provider, enable it manually, send one event to a registered account/inbox controlled by the operator, capture receipt without address, token, or credential in logs, then turn external delivery off and verify read-back. Manual inbox evidence is necessary for ML-1 and cannot be substituted by a unit test. | ML-1, ML-2, ML-3, ML-4, ML-7 |
| 7 | Update `docs/events.md`, `docs/operations.md`, `docs/capacity.md`, `docs/testing.md`, `docs/QUESTIONS.md`, and `docs/traceability.md` with actual commands, limits, failure modes, measured evidence and honest coverage. Mark ML items complete in `docs/day-4-checklist.md` only after their checks pass. | ML-1..ML-8, EVT-12, OPS-5, PR-1 |

## Verification contract

`npm run verify:mail` runs mail unit tests and an isolated sink-only integration
check and is called by `verify:day4`. The live harness overrides developer
mail settings with Mailpit and verifies the effective Compose worker environment
before making any request; unit tests mock Nodemailer and reject external mode.
The command stops and restores only its disposable Compose project, never the
operator's running stack or provider. It prints event state but no reset-token
payload, credential or message body.
External live-send proof is deliberately separate from every automated command and
requires explicit operator action. Record actual provider terms and the witnessed
delivery only after verification; until then ML-1 through ML-7 are uncovered.