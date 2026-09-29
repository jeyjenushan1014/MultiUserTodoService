# Day 4 Traceability

Only a completely implemented requirement is allowed in the evidence table. A partial
implementation, design, planned test, or manual code reading is not evidence. Incomplete
requirements stay out of the evidence table and are listed separately as coverage gaps, as required
by TRC-2.

## Completed requirements and evidence

| Requirement | Status | Automated check | What the check proves |
|---|---|---|---|
| AUT-1 | Covered | `npm run verify:authorization` | Every role and operation has an unambiguous documented decision, and every documented yes/no cell matches the built public policy artifact. |
| TN-1 | Covered | `npm run test -w @todo/account-service -- workspace` and `docs/authorization.md` §7 manual steps | A registered person can create a workspace and add another registered person to it, reachable end to end through `POST /api/v1/workspaces` and `POST /api/v1/workspaces/:id/members`, live-verified against the running Gateway and Account Service. |
| TN-8 | Covered | `npm run test -w @todo/account-service -- workspace.service.test.ts` (self-change → 403) plus the live manual check in `docs/authorization.md` §7 item 2 | A caller cannot add or change their own workspace membership through the membership-mutation endpoints, verified both at the unit level and against the running stack. |
| TN-12 | Covered | Live manual check in `docs/authorization.md` §7 item 4 | A removed member receives the identical `404 WORKSPACE_NOT_FOUND` response a non-existent workspace would return, so membership or workspace existence cannot be inferred from the response. |

## Coverage gaps — no evidence claimed

TN-2 through TN-7 (TN-6/TN-7 designed but not enforced by any service other than Account Service
itself — no local projection exists yet in Gateway or Todo Service); TN-9 (guard exists and is unit
tested but is not reachable through the current public API — see `docs/authorization.md` §5 note,
and is therefore not claimed as end-to-end covered); TN-10, TN-11; WF-1 through WF-10; BC-1
through BC-17; EV-1 through
EV-11; PF-1 through PF-10; DG-1 through DG-10; OP-1 through OP-10; PR-1 through PR-8; ML-1
through ML-8; DOC-10 through DOC-12; EVT-8 through EVT-12; ARC-8 through ARC-11; AUT-2
through AUT-5; ONC-1 through ONC-7; OPS-1 through OPS-6; and TRC-1 through TRC-5 have no
evidence claim yet. Earlier Day 2/Day 3 evidence remains in `docs/testing.md`, but it must not be
relabelled as Day 4 proof.

## Commit proof rule

Only when a requirement is completely finished may a future feature commit move it from coverage
gaps into the evidence table. That commit must provide:

1. the exact requirement ID;
2. an exact command that can run the relevant check by itself;
3. what failure that check detects;
4. the relevant operational or public documentation.

A requirement with any remaining implementation gap stays entirely outside the evidence table. A
commit is not allowed to mark it covered based only on a document, manual inspection, or a test
fixture defined from the consumer under test.