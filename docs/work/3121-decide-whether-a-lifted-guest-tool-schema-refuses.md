---
kind: decision
status: open
updated: 2026-11-15
priority: P3
area: plugin
---

# Decide whether a lifted guest tool schema refuses or strips extra arguments

## What

`packages/kit/src/json-schema/lift.ts` lifts a guest's closed JSON Schema object (`additionalProperties` absent or `false`) into a strip-mode zod object, so a model tool call with an argument the schema does not name is accepted with that argument dropped. The lift's header says refusal beats looseness. The choice is `z.strictObject` (the call is refused and the model is told) or strip (the call runs without the extra argument). Recommended: strict, which matches the closed schema the guest declared and the header's refuse-over-loosen rule.

## Why

The lift is the trust boundary for guest tool arguments; the current mode was never stated, and the two readings give the model different feedback.

## Done when

The lift's object mode is the ruled one, the golden round-trip still holds, and a test pins what a tool call with an extra argument does.

## Evidence

Filled at landing: what ran and where its output is.
