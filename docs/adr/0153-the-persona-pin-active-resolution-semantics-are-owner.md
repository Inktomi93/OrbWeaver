---
kind: adr
status: active
updated: 2026-09-23
---

# the persona PIN/ACTIVE resolution semantics are owner-gated; the persona SURFACES are not

## Context

Not recorded in the ledger row.

## Decision

Owner-ruled, verbatim: *"the only sacred thing to me is the mechanics of how active persona and pinned persona resolve between areas — y'all don't need to freeze persona shit."* Sacred = how the host pin (`chats.anchorPersonaId`) and the per-member active persona (`chat_participants.activePersonaId`) resolve into `{{user}}` and turn identity (\[\[D122]]): VALIDATION AT THE BOUNDARY — ownership checks, leak-free refusals that change no resolution order — is free; a BEHAVIOR change is reported with evidence and waits for the owner, never fixed in-lane. NOT sacred: the pickers, menus and editor surface, which migrate freely (the unified Config system takes them). Enforcer: `tests/server/domain/chat/persona-resolution.suite.int.test.ts` passes BYTE-UNTOUCHED and green — editing the suite to fit a change is the tell that the change is wrong; the sign-off half is owner-ruled, prose-enforced.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
