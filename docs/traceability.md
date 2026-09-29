# Day 4 Traceability

Only a completely implemented requirement is allowed in the evidence table. A partial
implementation, design, planned test, or manual code reading is not evidence. Incomplete
requirements stay out of the evidence table and are listed separately as coverage gaps, as required
by TRC-2.

## Completed requirements and evidence

| Requirement | Status | Automated check | What the check proves |
|---|---|---|---|
| AUT-1 | Covered | `npm run verify:authorization` | Every role and operation has an unambiguous documented decision, and every documented yes/no cell matches the built public policy artifact. |

## Coverage gaps — no evidence claimed

TN-1 through TN-12; WF-1 through WF-10; BC-1 through BC-17; EV-1 through
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