---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: server
---

# A draft with an unpaired surrogate is refused as too large for the macro pass

## What

`processMacrosOutcome` in `packages/kit/src/macro/engine.ts` reports `degraded: true` both when the byte budgets trip and when the input holds an unpaired UTF-16 surrogate. `packages/server/src/domain/chat/assembly/context.ts` maps every degraded freeze to `message_macro_budget` with "the message is too large for the macro pass". Probe: `"hello \uD800 there"` is refused with that message. The outcome carries no cause, so a correct name needs a cause on `MacroRenderOutcome` and a new contract code, not one line.

## Why

The refusal is right (nothing is stored empty) but the reason is false, and a client keying on the code would tell the user to shorten a short message.

## Done when

`MacroRenderOutcome` names the cause (budget or malformed input), the send path refuses a malformed draft with its own code and wording, and `tests/server/domain/chat/verbs/send-macro-budget.int.test.ts` gains the surrogate case.

## Evidence

Filled at landing: what ran and where its output is.
