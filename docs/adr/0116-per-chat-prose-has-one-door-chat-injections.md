---
kind: adr
status: active
updated: 2026-09-23
---

# Per-chat prose has ONE door: `chat_injections` (SUPERSEDES `roomOverrides.authorsNote` whole)

## Context

Not recorded in the ledger row.

## Decision

The owner's ruling ("injections is literally author's note") was confirmed by the position map before execution: both mechanisms produced an `InjectionCandidate` in the SAME unified list riding the SAME depth splice — a system injection at depth 4 was byte-for-byte the room author's note. Deleted whole: the schema field + defaults, the assembler's room-note branch, the UI's dedicated textarea/Depth/Role controls. **(1) The hidden suppression rule is gone:** a non-empty room note suppressed every seated character's card `depthPrompt`; chat notes and card notes now coexist (pinned). If a chat-level card-note mute is ever wanted, it returns as its OWN honest knob, never as a side effect of prose presence. **(2) Removed-key posture:** `roomOverrides` is `.strict()` + `.catch(undefined)` at the read seam — a stored `authorsNote` heals the whole sub-blob to absent (NO-LEGACY; dev debris only). **(3) ST parity is one-way:** import preserves `note_prompt` as a `chat_injections` row (system @ depth 4); export emits none (a LIST of injections has no unambiguous inverse into ST's single slot — flagged, not hidden).

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
