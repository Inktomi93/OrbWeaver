---
kind: adr
status: active
updated: 2026-09-23
---

# Kit owns the message role axis

## Context

Not recorded in the ledger row.

## Decision

`kit/message-role` owns `MESSAGE_ROLES`/`MessageRole` (THE canonical role axis) + the ST numeric bimap; the wire schema (`messageRoleSchema`) lives in `@orb/contracts/chat` importing the tuple down. `kit/injection` owns `InjectionPlacement {depth, role}`, `MAX_INJECTION_DEPTH`, `injectionDirectiveSchema`, `resolveInjectionPlacement(raw, defaults)` — every injector (world-info, author's notes, persona, memory recall, guided) imports these; consumers share the SHAPE, never the default values.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
