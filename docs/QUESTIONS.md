# Questions and Challenges

## Day 4: mail delivery decisions (planning, 2026-10-02)

This section records open Day 4 decisions, not evidence of a live provider send. The
implementation order and checks are in `docs/mail-delivery-plan.md`. Nothing here
changes the sink-only default.

1. How can I enable external delivery without redeploying either notification worker?
	A singleton PostgreSQL mode row and Docker-only operator command now control
	delivery without changing business rules. Two readers and pinned event
	destinations were verified against the live database. External provider
	settings and a secret file must be prepared first; a real delivery has not
	yet been demonstrated.
2. Which free-tier external provider accepts a personally controlled sender without
	a card or company domain? Brevo SMTP is a candidate, not a verified choice. Check
	current signup/sender requirements and quota before configuring a real send. If
	disqualified, choose another qualifying SMTP provider without changing the code
	that decides which notification to send. No paid plan or company domain is allowed.
3. What happens when the provider accepts a message but the worker dies before marking
	it sent? The existing event-ID claim prevents concurrent workers sending together,
	but not a duplicate after the lease expires. Find provider idempotency support or
	document the residual duplicate risk; never call the existing delivery exactly once.
4. How do retry, per-address quotas, and account deletion interact? At present a failed
	notification is retried twice using a delayed queue (30 and 60 seconds), then
	reaches the DLQ after the third failure. Account erasure scans that new retry
	queue as well. Gateway's rate limits are still per caller, not per destination.
	The five-per-24-hour atomic address quota and send/deletion lock have live
	PostgreSQL proof. The local mail-dependency outage/replay proof passes via
	`npm run verify:mail`; a real provider refusal/throttling proof is pending,
	and the deployed database's older 011 deletion schema needs reconciliation
	before the full account-erasure command can be trusted. Do not claim ML-5,
	ML-7, or DG-10 from these partial checks alone.
5. What is left out for now? No external account or credential has been provisioned,
	no real inbox has been sent to. Stage 5 proves local Mailpit outages, not
	real provider throttling or the complete ML-5 requirement.
	Keep tests sink-only and report provider qualification or live-send blockers openly.

## Day 3: historical questions

The following is the Day 3 version of this document. Day 2's questions (Docker setup, single-service Redis
caching) are superseded — the system is now three services plus five worker processes coordinated
through Postgres, Redis, and RabbitMQ, and the hard problems moved with it.

## 1. How do I keep two services' event contracts from silently drifting apart?

### Challenge

Todo Service publishes domain events (`todo.shared`, `account.email-changed`, etc.) that Account
Service consumes, and vice versa. Early on, the consumer's parsing schema and the producer's actual
payload were written independently in two different packages, so a passing unit test on each side
proved nothing about whether the two services agreed with each other. A schema mismatch only shows
up at runtime, as a dead-lettered message, which is much harder to notice than a failing test.

### Solution

Event payload types now live once, in `@todo/contracts`, and both the producer and the consumer
import the same type instead of each maintaining its own copy. I also deleted a second, unused
event-contract module (`integration-events/`) that existed only in `dist/` output and was never
imported anywhere, so there was exactly one definition of each event's shape left to drift from.

### Learning Outcome

A shared contract package only prevents drift if it is the *only* place the shape is defined and
every consumer actually imports from it — a second definition sitting unused is just as dangerous
as no shared definition at all, because nothing stops someone from wiring it up later by mistake.

## 2. How do I avoid two authentication implementations quietly disagreeing?

### Challenge

The gateway grew two ways to verify an access token: a router-level middleware that also checks the
session is still live, and a controller-level function that only checks the JWT signature. They used
different error codes for the same failure (`INVALID_ACCESS_TOKEN` vs `UNAUTHORIZED`), and only one
of them re-checked whether the session had been revoked.

### Solution

I extracted the actual JWT-parsing/verification logic into one shared module
(`security/access-token-claims.ts`) and made both call sites use it, so there is one error vocabulary.
Endpoints that should stop working the instant a session ends (profile, email change) now go through
the session-checked middleware. Logout deliberately keeps the signature-only path, because logout has
to succeed even against a token whose session was already ended by something else (a second logout
call, or reuse-detection revoking every session on the account) — collapsing that into the
session-checked path would make logout itself fail in exactly the case it exists to handle.

### Learning Outcome

"Two implementations of the same concept" is not always a bug to delete down to one; sometimes it is
two call sites with a genuinely different requirement that were previously hiding behind duplicated
code instead of a documented decision. The fix was to make the shared part shared and keep only the
part that is actually different.

## 3. What did I deliberately choose not to change in this pass?

This pass focused on the review's minor findings (m2–m10): health reporting, password-reset rate
limiting, docker-compose start ordering, the Redis healthcheck, the duplicate event contract, the
two auth paths, and documentation drift in `docs/api.md` and `docs/events.md`. The larger, riskier
findings from the same review — the ones that require an actual design decision rather than a small
correction (for example, how session revocation should be checked without a synchronous call to
Account Service on every TODO read) — were left for a follow-up pass rather than folded in here,
because getting that tradeoff right is worth its own review rather than a rushed change alongside
a batch of smaller fixes.

## Overall Reflection

The recurring theme this time was not "does this one component work" but "do two independently
written components still agree with each other" — a shared contract, a duplicated auth check, and a
stale doc are all the same failure mode: something was true when it was written and nothing forced it
to stay true afterward. `npm run check` catches the first kind of bug; it does not catch the second,
which is why this document exists.
