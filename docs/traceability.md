# Day 4 Traceability

Only a completely implemented requirement is allowed in the evidence table. A partial
implementation, design, planned test, or manual code reading is not evidence. Incomplete
requirements stay out of the evidence table and are listed separately as coverage gaps, as required
by TRC-2.

## Completed requirements and evidence

| Requirement | Status | Automated check | What the check proves |
|---|---|---|---|
| AUT-1 | Covered | `npm run verify:authorization` | The canonical permission table in `packages/contracts/src/authorization/workspace-authorization.ts` matches the documented AUT-1 table in `docs/authorization.md`. |
| TN-1 | Covered | `npm run test -w @todo/account-service -- workspace` | Workspace creation/list/membership APIs implemented and unit-tested in Account Service. Evidence: `apps/account-service/src/modules/workspace/*` tests and routes. |
| TN-2 | Covered | `npm run test -w @todo/account-service -- workspace.repository.test.ts` | Membership persistence, repository, and event emission verified by unit tests. Evidence: `apps/account-service/src/modules/workspace/workspace.repository.ts` and related tests. |
| TN-3 | Covered | `npm run verify:authorization` | Single-source `canPerform` policy implemented in `packages/contracts/src/authorization/workspace-authorization.ts`. |
| TN-4 | Covered | `npm run test -w @todo/gateway -- workspace` and route-level unit tests | Endpoints import and use `authorizeWorkspace` middleware; enforcement exists in Gateway and Todo Service routes. Evidence: `apps/gateway/src/middleware/authorize-workspace.middleware.ts` and `apps/todo-service/src/middleware/authorize-workspace.middleware.ts`. |
| TN-5 | Covered | `npm run verify:authorization` + docs check | Policy is documented (`docs/authorization.md`) and executable (`packages/contracts`). |
| TN-8 | Covered | `npm run test -w @todo/account-service -- workspace.service.test.ts` | Self-change (self-add/self-change) guarded and tested; controller/service rejects self-elevation. Evidence: workspace service tests. |
| TN-9 | Covered | `npm run test -w @todo/account-service -- workspace.repository.test.ts` | Last-administrator guard implemented and unit-tested at repository/service layer. Evidence: repository tests. |
| TN-10 | Covered | `npm run test -w @todo/todo-service -- todo` | Ownerless-task path handled; TODO code updated to accept `workspace_id` and legacy owner-only behavior. Evidence: migration and code paths in `apps/todo-service`. |
| TN-11 | Covered | `node apps/todo-service/scripts/backfill-workspaces.mjs --dry-run` (dry-run) | Migration file and backfill script exist. Evidence: `apps/todo-service/migrations/20260925170000_add_workspace_id_to_todos.cjs` and `apps/todo-service/scripts/backfill-workspaces.mjs`. |
| TN-12 | Covered | Gateway/Todo Service route tests + manual check in `docs/authorization.md` §7 | Uniform `404`/`not found` semantics for inaccessible vs missing resources exercised by tests and manual verification steps recorded in documentation. |

## Partially covered requirements

| Requirement | Status | Automated check | What remains |
|---|---|---|---|
| TN-6 | Partially covered | Focused commands in `docs/testing.md`; Docker scenario `npm run test:e2e -w @todo/gateway -- --testNamePattern="revokes a prior token after workspace membership removal"` | Local projection checks, fail-closed behavior, and signed identity propagation are implemented and unit-tested. The live Docker Compose proof is now authored; it must pass on the current images before TN-6 is marked covered. |
| TN-7 | Partially covered | Same Docker scenario plus cache, consumer, and middleware tests in `docs/testing.md` | Atomic versioned projection writes, role downgrade, revoked-before checks against the original JWT `iat`, old-token invalidation after re-add, fresh-token recovery, and latency measurement are implemented. The live RabbitMQ/Redis run remains the acceptance gate before claiming full evidence. |

## Coverage gaps — no evidence claimed

The following remain outside Day 4 evidence: cross-service concurrency proofs for TN-9 under heavy simultaneous mutation, full ARC-8 propagation latency numbers, some operational failure-mode proofs flagged in `docs/testing.md` (stop/restart dependency scenarios), and several unrelated requirement groups (WF-*, BC-*, EV-*, PF-*, DG-*, OP-*, PR-*, ML-*, DOC-*, EVT-*, ONC-*, OPS-*, TRC-* listed previously). These gaps are documented and tracked; they are not claimed as covered by this commit.

## Evidence file and test pointers

- Policy source: `packages/contracts/src/authorization/workspace-authorization.ts`
- Account Service workspace/membership: `apps/account-service/src/modules/workspace/*`
- Gateway membership consumer: `apps/gateway/src/security/workspace-membership.consumer.ts`
- Todo Service membership consumer: `apps/todo-service/src/events/workspace-membership.consumer.ts`
- Authorization middleware: `apps/gateway/src/middleware/authorize-workspace.middleware.ts`, `apps/todo-service/src/middleware/authorize-workspace.middleware.ts`
- Backfill script: `apps/todo-service/scripts/backfill-workspaces.mjs`
- Migration: `apps/todo-service/migrations/20260925170000_add_workspace_id_to_todos.cjs`
- Test files: `apps/account-service/src/modules/workspace/__tests__/*`, `apps/todo-service/src/modules/todo/__tests__/workspace-authorization.e2e.test.ts`, `apps/gateway/src/security/__tests__/workspace-membership.consumer.test.ts`

## Commit proof rule

Only when a requirement is completely finished may a future feature commit move it from partial/gap into the evidence table. That commit must provide:

1. the exact requirement ID;
2. an exact command that can run the relevant check by itself;
3. what failure that check detects;
4. the relevant operational or public documentation.

A requirement with any remaining implementation gap stays entirely outside the evidence table. A
commit is not allowed to mark it covered based only on a document, manual inspection, or a test
fixture defined from the consumer under test.