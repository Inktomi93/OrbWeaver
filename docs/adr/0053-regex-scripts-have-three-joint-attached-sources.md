---
kind: adr
status: active
updated: 2026-11-14
---

# Regex scripts have three joint-attached sources

## Context

Not recorded in the ledger row.

## Decision

Regex scripts: THREE sources joint-attached (per-character `characters.regexScripts`, preset-embedded, owner-global `fetchOwned`) — never polymorphic. Precedence: anything mutating the SHARED prompt or canon (`USER_INPUT`, `WORLD_INFO`, persist-affecting `AI_OUTPUT`/`REASONING`) is HOST-owned, server-side, resolved under `runAsUserId`; a non-host member contributes NO shared-prompt regex. Per-user `markdownOnly` (display-only) scripts run CLIENT-side, ephemeral — they can never reach shared state. The flags ARE the tier discriminant. ReDoS: no pattern is refused for its shape. A shape filter is not a guard: the stacked-quantifier count refused common lazy patterns that finish in milliseconds and still admitted `(a+)+$`. `@orb/kit/regex` holds the executor and the stored-length cap; the guards are in `@orb/server/primitives/regex` (never browser-bundled), on every server leg. Each text's scripts run in one `node:vm` entry with a row deadline; a script that runs past it is stopped, named through `onScriptFailure` and skipped, and the text keeps what it had. Every entry of a leg pass draws on one budget of thread CPU; once it is spent, the scripts still to run are skipped and named, so a library of slow scripts costs one budget, not scripts times the deadline. A compile cannot be interrupted, so every write that stores a find pattern measures its compile once in a one-shot worker and refuses, by name, one over the compile limit. The browser display tier has no deadline; until it has one of its own, the display nested-quantifier check in `packages/client/src/lib/message-render.ts` stands in.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
