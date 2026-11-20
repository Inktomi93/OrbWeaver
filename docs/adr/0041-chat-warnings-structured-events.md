---
kind: adr
status: active
updated: 2026-11-20
---

# Chat warnings are structured events

## Context

Not recorded in the ledger row.

## Decision

Resolve-chat warnings are a STRUCTURED `warning` ChatEvent (`{kind:"warning", at, code, message}`) emitted into `ChatResult.events` + `onEvent` by all chat runners — never log-only. `WARNING_CODE` (`packages/contracts/src/inference/warnings.ts`) holds EXACTLY the real emit sites (currently `sampling_knob_dropped`, `effort_dropped`, `adaptive_budget_dropped`, `display_dropped`, `verbosity_dropped`, `dynamic_context_demoted` — the object is the truth, not this list) — no speculative codes; clamps are silent by design. `resolve-chat.ts` is the ONE home for the `(UserIntent × ModelCapability) → ResolvedChatKnobs` policy — runners consume it, never inline their own. `scripted-override.ts` is the RUNNER_OVERRIDE dev seam (spec injected by entry, never reads env).

Every warning stays on `ChatResult.events` and the wire-outcome ring. The chat room is told of a dropped control only where the model's descriptor states that control (D68, `announcesWarning`), because the editor hides every other control.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
