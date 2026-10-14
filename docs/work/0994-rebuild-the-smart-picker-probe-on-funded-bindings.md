---
kind: work
status: open
updated: 2026-10-14
priority: P2
area: inference
plan: test-foundation
---

# Rebuild the Smart picker probe on funded bindings and chat-owned inference operations

## What

Replace fabricated stores, binding mutations and copied speaker-reranker selection in `scripts/probes/smart-picker-live/run.ts` with persisted credentials, connections and bindings. Use composed chat-owned inference operations and preserve production catalog admission.

## Why

Fake stores bypass binding consent, ownership and write admission. Missing local-light models must fail at the real admission stage, not pass through fabricated connections.

## Done when

Remove legacy helpers and copied selection rules. Preserve every scene: open floor, role addressing, clear names, shared human names, duplicate names, narrator, off-roster and self-response. Preserve utility and rerank vehicles, call and no-call results, unbound degradation and missing-model refusal. Inject randomness; cover abort, security and capture-by-value. A scripted test must catch a production defect. Keep provider quality calls opt-in.

## Evidence

Filled at landing: what ran and where its output is.
