# Day 4 Activity — Questions, Challenges, and Resolutions

This is the Day 4 activity journal. It records what I was unsure about, what I tried, what went
wrong, the decision I made, and why. It is not a list of completed requirements. Completion and
automated evidence are recorded separately in `docs/traceability.md`.

## Activity 1 — What should I build first?

### Question

Day 4 contains more work than can safely be completed at once. Should I begin with workspace
endpoints, the distributed workflow, or the Solidity contract?

### Challenge

Starting with endpoints before deciding where authorization state lives would repeat the Day 3 M1
problem. Starting with the chain would be dangerous because chain writes cannot be deleted. Trying
to implement every section together would leave many requirements half-built and unprovable.

### What I considered

1. Build the blockchain section first because it is unfamiliar.
2. Build workspace endpoints immediately and decide authorization propagation later.
3. First finish Day 3 blockers, decide authorization state, define the permission policy, and then
   build persistence and enforcement in small commits.

### Resolution

I chose option 3. The build order is:

1. verify all eight Day 3 fixes;
2. resolve TN-6 and TN-7 on paper;
3. define the shared role/action policy;
4. build workspace and membership persistence;
5. publish membership events and build local projections;
6. enforce authorization and migrate legacy tasks;
7. build and prove the distributed workflow;
8. complete Solidity practice before production chain code;
9. continue with evolution, performance, lifecycle, operations, and real mail.

### Learning

The highest-risk architectural decision must come before endpoint implementation. Irreversible
features such as public-chain writes and real mail must wait until their data and safety rules are
proven.

## Activity 2 — How can authorization be local and revocation immediate? (TN-6/TN-7)

### Question

TN-6 forbids a synchronous authorization call to another service, but TN-7 says role reduction or
removal must affect a previously issued token and an in-flight request immediately. Where should
current membership authority live?

### Challenge

The two obvious approaches each violate a requirement:

- putting a role in the JWT makes the role stale until the token expires;
- calling Account Service for every request makes authorization unavailable when Account Service
  is unavailable and repeats review finding M1.

### What I tried or reviewed

I reviewed the session-revocation fix already present in the system. Account Service commits a
revocation event with its state change, Gateway consumes it, and authentication checks locally held
revocation state rather than calling Account Service for every request.

### Resolution

Account Service will own workspace membership. It will publish versioned membership-change events
transactionally. Gateway and Todo Service will maintain local membership projections and make
decisions from local state. JWTs will carry identity, never a workspace role. Removal will retain a
revocation timestamp so requests using older authority can be rejected.

### Remaining challenge

This is still a design, not completed evidence. “Immediate” must be made precise and proven against
a real concurrent request when the producer, projection consumers, and endpoint enforcement exist.

### Learning

Local authorization does not mean static authorization. Ownership can remain centralized while
decision state is replicated through durable events, but event delivery alone does not prove the
in-flight-request clause.

## Activity 3 — Where should role permissions be defined? (TN-3/TN-4/TN-5)

### Question

How can every service enforce the same roles without copying `if (role === ...)` conditions into
each endpoint?

### Challenge

If Gateway, Account Service, and Todo Service define permissions independently, their rules can
drift. Adding a role would require changes throughout the codebase, violating TN-5.

### What I considered

1. Store permissions in each service.
2. Put role names in the JWT and let each endpoint interpret them.
3. Define roles, actions, a complete permission matrix, and one `canPerform` function in the shared
   contracts package.

### Resolution

I chose option 3. `@todo/contracts` now defines administrator, editor, and viewer; eleven actions;
the complete Boolean permission matrix; and `canPerform(role, action)`. The type requires a decision
for every role/action combination.

### Remaining challenge

TN-3, TN-4, TN-5, and AUT-2 are not complete because no workspace or task endpoint enforces this
policy yet. They receive no evidence until every relevant endpoint uses the shared function and an
automated check rejects a second policy or direct role comparison.

### Learning

A shared table prevents definition drift, but it is not proof of system-wide enforcement. Defining
a policy and enforcing it are separate deliverables.

## Activity 4 — How do I prove the permission document matches the code? (AUT-1)

### Question

Could the Markdown permission table say something different from the executable policy while all
unit tests remain green?

### Challenge

Yes. A policy unit test only proves the code. Manually copying the table into documentation creates
a second source that can drift, which repeats the Day 3 producer/consumer mismatch failure mode.

### What I tried

I first added unit tests for policy completeness and role differences. Those tests did not read the
documentation, so they could not detect a wrong yes/no cell in `docs/authorization.md`.

### Resolution

I added `npm run verify:authorization`. It builds the public contracts artifact, runs the policy
tests, reads the AUT-1 Markdown table independently, and compares all 33 documented decisions with
the built `canPerform` result.

I deliberately changed one documented `yes` to `no`. The verifier failed with an AUT-1 disagreement.
After restoring the cell, the verifier passed and printed:

```text
Authorization proof passed: 3 roles x 11 actions; AUT-1 matches the built public contract.
```

### Resolution status

AUT-1 is complete and has evidence in `docs/traceability.md`.

### Learning

Documentation is only reliable when a check compares it with an independent executable artifact.
Testing code against values copied from the same code would not prove compatibility.

## Activity 5 — When should evidence be added?

### Question

Should a traceability row contain evidence for the part of a requirement that is already built?

### Challenge

Initially I described TN-3, TN-4, TN-5, and AUT-2 as partially covered. That made it difficult to
distinguish completed requirements from designs or supporting code.

### Resolution

Evidence is now added only when the entire requirement is implemented and proven. Partial work is
not placed in the evidence table. TRC-2 still requires uncovered requirements to be honest, so they
are named separately under “Coverage gaps — no evidence claimed.”

Every future completed evidence entry must include:

1. the exact requirement ID;
2. an exact command that runs the automated proof;
3. the failure that check detects; and
4. the relevant public or operational documentation.

### Learning

“Some supporting code exists” is not the same as “the requirement is satisfied.” A shorter evidence
table containing only defensible claims is more useful than a complete-looking table of partial
claims.

## Activity 6 — Why did the contracts test initially fail linting?

### Question

Why did the new Vitest test run successfully but ESLint report that the test file was not found by
the TypeScript project service?

### Challenge

The contracts package originally excluded test files from its only `tsconfig.json`. Vitest could
transform the test, but type-aware ESLint could not associate it with a TypeScript project.

### What I tried

I first changed the existing configuration to a no-emit development configuration. That broke
TypeScript project references because the Common package expects the Contracts project to be
composite and emit declarations.

### Resolution

I kept the main contracts TypeScript project composite and aware of Vitest types, then added a
separate `tsconfig.build.json` that excludes tests from production output. This lets Vitest and
ESLint understand tests without publishing them.

### Learning

Test discovery, type-aware linting, build emission, and TypeScript project references are different
concerns. A package with project references needs configuration that satisfies all four rather than
fixing one by disabling emit globally.

## Activity 7 — What is the next implementation problem?

### Question

After defining the policy, what is the next smallest complete piece of Day 4 work?

### Challenge

Workspace persistence must support creation and membership while preventing self-escalation and a
workspace with no administrator. The last-administrator invariant can fail under concurrency even
when sequential tests pass.

### Resolution

The next planned commit is:

```text
feat(account): add workspace and membership persistence
```

It will add reversible Account Service migrations, repositories, transactional workspace creation,
registered-member validation, self-add/self-promotion protection, and a real PostgreSQL concurrency
test for simultaneous administrator removal or demotion.

No TN requirement receives evidence merely because the tables exist. Evidence is added only when
every clause of an individual TN requirement is complete and its automated failure test passes.

### Progress made

The persistence foundation now exists: reversible migrations create `workspaces` and
`workspace_members`; workspace creation inserts its initial administrator in the same transaction;
and membership mutations serialize on the workspace row before checking actor authority and the
last-administrator invariant. Unit tests exercise transaction ordering, rollback, self-add refusal,
non-administrator refusal, and last-administrator refusal.

This does not complete a TN requirement. There is no public workspace API, no real PostgreSQL
concurrency proof, no membership event, and no task migration or endpoint enforcement. Therefore no
new Day 4 evidence row is added.

## Activity 8 — Why did Windows report a missing `WORKSPACE_ACTIONS` export?

### Question

Why did `node scripts/verify-authorization-docs.mjs` report that
`packages/contracts/dist/index.js` did not export `WORKSPACE_ACTIONS` even though the source package
exports the authorization module?

### Challenge

The verifier intentionally imports the built public artifact, not TypeScript source. `dist` is
ignored by Git, so a checkout can retain an older local artifact. TypeScript incremental metadata
can also say a build is current even when a different configuration produced the metadata. In that
case Node correctly reads the stale JavaScript and cannot find the new export.

### Resolution

`npm run verify:authorization` now cleans the Contracts `dist` directory before building. The build
configuration also uses its own `tsconfig.build.tsbuildinfo` file instead of sharing incremental
metadata with the development/test configuration. A direct manual invocation of the verifier still
expects the artifact to have been built first; the supported command is `npm run
verify:authorization`.

### Learning

Generated artifacts that are ignored by Git cannot be assumed to match checked-out source. A proof
command that tests a built public interface must create that artifact from a known clean state.
The npm output is also evidence about the checked-out revision: if `verify:authorization` prints a
command without the clean step, the cleanup fix is not present locally. Cleaning and rebuilding
cannot repair a missing source-level root export. The verifier now loads the root module as a
namespace so that this situation produces a direct diagnostic naming the missing exports and the
source file to inspect instead of Node's named-import syntax error.

## Activity 9 — Do I need another infrastructure component?

### Question

Do tenancy, authorization projection, workflows, chain processing, or mail require infrastructure
beyond PostgreSQL, Redis, RabbitMQ, and the mandatory chain?

### Resolution

No additional infrastructure component is currently justified. PostgreSQL stores durable state and
workflow progress, RabbitMQ transports events, and Redis holds shared short-lived state where
appropriate. If an existing component cannot meet a requirement, I will record the exact blocking
requirement and rejected alternatives here before adding anything.

## Activity 10 — How does membership authority reach other services?

### Question

How can Gateway and Todo Service learn membership changes without synchronous
authorization calls?

### Challenge

Publishing after the membership transaction creates a crash window. Publishing
before commit can expose a membership change that later rolls back.

### What I considered

1. Call each service synchronously.
2. Publish directly to RabbitMQ inside the request.
3. Insert a versioned event into Account Service's transactional outbox.

### Resolution

Account Service inserts `workspace.membership-changed` version 1 into
`outbox_events` in the same transaction as the membership mutation. The
existing outbox worker publishes it after commit. Removal uses `role: null`.

### Remaining challenge

Gateway and Todo Service consumers, idempotent projections, rebuild commands,
and immediate-revocation proof are not implemented yet.

### Learning

A transactional outbox removes the database/broker dual-write gap, but it does
not by itself prove authorization propagation or TN-7.



```markdown
## Activity N — Short title (requirement IDs)

### Question
What was unclear?

### Challenge
What made it difficult or what failed?

### What I tried
Which alternatives or experiments were attempted?

### Resolution
What was decided or changed, and why?

### Evidence
Include this section only if the entire requirement is complete. Give the exact automated command,
the failure it detects, manual demonstration steps if required, and relevant documentation.

### Remaining challenge
What is intentionally unfinished? Do not present it as evidence.

### Learning
What will change in the next implementation because of this activity?
```