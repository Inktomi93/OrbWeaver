---
kind: adr
status: active
updated: 2026-09-23
---

# Turn shaping is a capability axis

## Context

Not recorded in the ledger row.

## Decision

Turn shaping is a CAPABILITY AXIS (`ModelCapability.turns` — prefill/cache/mid-conv-system/roleHandling/squash), derived per wire-shape by `deriveWireShape` plus curated refinement, never guessed at a call site.

Standing rulings: prefill decisions happen at SHAPE. The trailing continuation cue, `continuationNudge`, is the PRESET-homed PROSE-1 slot `chat.assembly.continuationNudge`, not a `const`, gated on `turns.assistantPrefill`. Explicit prompt-cache placement is the R1 rolling PAIR, gated on `turns.explicitPromptCache` with per-model minimum-prefix floors (`CACHE_MIN_FLOOR`) — no model-id sniffing, no hardcoded 1024. The volatile/stable prompt boundary is computed at SHAPE (`prefixBoundaryLen`) so a dynamic change can never rewrite the cached prefix. `roleHandling` and `squashSystemMessages` are USER knobs homed on `UserIntent.advanced` — a ratified deviation; the design drafted `roleHandling` on `RouteChatAssignment`, but the code's home won.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
