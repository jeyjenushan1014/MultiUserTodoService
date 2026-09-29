# Authorization Design — Tenancy & Roles (Day 4)

**Status: design only.** No workspace or role code exists yet. This document is written and
committed before any implementation, per the rule that the TN-6/TN-7 tension has to be resolved
on paper first — changing where authorization state lives after code depends on it means
rewriting every service's assumption about the caller twice instead of once.
**Status: permission policy and persistence foundation implemented; public workspace APIs,
projections, and endpoint enforcement pending.** This
document was written before implementation so that the TN-6/TN-7 tension was resolved on paper
first. The role/action policy now exists in `@todo/contracts`; no endpoint claims to enforce it
until the local membership projections described below have been built

## 1. The problem this document exists to resolve

- **TN-6**: a service must decide an authorization question using data it already holds. It must
  not make a synchronous call to another service to answer it.
- **TN-7**: removing a person from a workspace, or reducing their role, must take effect
  immediately — including for a token issued before the change, and including for a request
  already in flight when the change commits.

Read together, these forbid both of the obvious answers: you cannot put roles in the JWT (fails
TN-7, a stale token keeps the old role until it expires), and you cannot call the owning service
per request to check the current role (fails TN-6, and is exactly the defect M1 fixed for
sessions).

## 2. Precedent already shipped: session revocation (M1)

Account Service owns session state. Gateway used to call `GET /internal/v1/accounts/me` on every
authenticated request to check whether the caller's session was still valid — a synchronous call
per request, and the thing TN-6 forbids in general.

The fix, already implemented and tested:

1. Account Service publishes `account.session-revoked` (`{ userId, sessionId | null, revokedAt }`)
   transactionally, in the same commit as the session-revocation write, whenever a session is
   revoked (logout, refresh-token reuse, email change, password reset).
@@ -62,57 +63,92 @@ Source: `apps/account-service/src/outbox/session-revoked-event.ts`,
  new mechanism.
- **TN-6 satisfied**: every authorization check reads the local projection. No service calls
  another service to answer "is this caller allowed to do this."
- **TN-7 satisfied for removal**: when a person is removed, the projection is deleted for that
  pair and a `revoked-before` timestamp is recorded per `(userId, workspaceId)`, exactly like
  `account-revoked:{userId}` — a request already in flight, or a token issued a second earlier, is
  checked against that timestamp and rejected, not against a role that no longer exists.
- **TN-7 satisfied for role change**: the projection is overwritten in place; the next request
  reads the new role. There is no token-side role to go stale, because the token never carries a
  role — only identity.
- **Propagation latency**: bounded by event delivery time (observed to be well under one second
  in this stack's RabbitMQ setup), the same bound already true for session revocation. This number
  is what `ARC-8` and `AUT-4` will report once measured end-to-end.

## 4. Where the permission table lives (TN-3, TN-4, TN-5)

- The role → permitted-operation mapping is defined **once**, in `@todo/contracts`, as a plain
  data structure (not scattered `if (role === ...)` checks). Every service imports the same
  `canPerform(role, action)` function from that one definition.
- Adding a role, or changing what an existing role may do, means editing that one file. No
  endpoint's code changes, and no other role's test expectations change, because every check goes
  through the same function instead of each endpoint re-deriving the answer.
- This satisfies TN-5 directly: the table is the single place, and it is enforced from that single
  place everywhere, which is also what `AUT-2` will point to.

### Permission table (AUT-1)

The executable source of this table is
`packages/contracts/src/authorization/workspace-authorization.ts`. `canPerform(role, action)` is
the only policy decision function services may call. A row describes an operation; **yes** means
permitted and **no** means refused.

| Operation | Administrator | Editor | Viewer |
|---|---:|---:|---:|
| Read workspace | yes | yes | yes |
| Update workspace | yes | no | no |
| Delete workspace | yes | no | no |
| List members | yes | yes | yes |
| Add member | yes | no | no |
| Change member role | yes | no | no |
| Remove member | yes | no | no |
| Create task | yes | yes | no |
| Read task | yes | yes | yes |
| Update task | yes | yes | no |
| Delete task | yes | yes | no |

Role checks alone will not implement the invariants that depend on current state. The membership
write path must additionally prevent self-promotion and self-addition (TN-8) and must lock the
workspace membership rows while checking that an administrator removal or demotion would not
remove the last administrator (TN-9).

## 5. What this document does not yet decide

Listed explicitly so nothing here is claimed as done before it is:

- The exact role list and the operations each role permits (comes with the TN-3/TN-4
  implementation commit, and fills in the `AUT-1` table).
- The database schema for `workspaces` and `workspace_members` (comes with the TN-1/TN-2
  implementation commit).
- The last-administrator guard mechanics (TN-9).
- A real PostgreSQL concurrency proof for the workspace-row lock used by the last-administrator
  guard (TN-9).
- The backfill migration moving existing ownerless tasks into the "no workspace" path (TN-10,
  TN-11).
- The measured propagation latency number (comes once the event and consumer exist; will be
  recorded here and in `docs/architecture.md` ARC-8).

## 6. Manual verification of this document (design-stage proof)

There is no running code to test yet, so verification here means checking the design itself is
internally consistent and doesn't quietly reintroduce M1:

The policy and AUT-1 table have one executable proof command:

```bash
npm run verify:authorization
```

This builds and tests `@todo/contracts`, then reads this Markdown table independently and compares
all 33 decisions with the package's built public exports. Exact clean-clone steps, expected output,
and a deliberate-failure check are recorded in `docs/testing.md`. This command proves the policy
definition and its documentation agree; it does **not** prove endpoint enforcement or membership
revocation, which are not implemented yet.

1. Confirm no part of this design proposes putting `role` inside the access token — grep the
   codebase's JWT signing code (`apps/account-service/src/security/access-token.service.ts`) and
   confirm it still only signs `sub`, `sid`, `email`, `iat`. If a role ever appears there, this
   design has been violated.
2. Confirm the precedent it's based on is real, not aspirational: re-run
   `apps/gateway/src/middleware/__tests__/authenticate.middleware.test.ts` and re-read
   `apps/gateway/src/security/session-revocation.cache.ts` — the pattern being extended to roles
   must already work for sessions before it's trusted for roles.
3. When the workspace/role implementation commit lands, confirm it reuses
   `insertSessionRevokedOutboxEvent`'s shape (one shared outbox-insert helper called from every
   place membership changes) rather than duplicating the INSERT in four repositories — the
   session-revocation commit did this once already; the role commit should not regress to
   duplicating it.
