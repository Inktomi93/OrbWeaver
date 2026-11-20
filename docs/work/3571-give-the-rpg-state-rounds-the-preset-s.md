---
kind: work
status: open
updated: 2026-11-17
priority: P2
area: inference
---

# Give the RPG state rounds the preset's reasoning params

## What

Thread the chat role-preset's reasoning params (effort, including an explicit off) into the state-round requests instead of the hardcoded empty params: toForcedToolRoundRequest and runStructuredChat both send params: {} (packages/inference/src/roles/chat-rounds.ts:61,77), so every RPG state round, structured round and side-generation call runs at the capability's default effort with no way for the operator to lower it. Wire the round's params from the game's resolved connection preset (or an explicit round-level param on the RPG contract), so an admin can set the state round to low or none the way any other turn is set.

## Why

Heavy thinking spends the OUTPUT budget before the call ever happens (owner ruling from Sonnet: at high effort the reasoning gobbled the max-output limit and generation stopped short; the fix was raising the limit — not better models, more room). A state round truncated by `length` before it emits its tool calls folds as a silent no-writes round — indistinguishable from a model that legitimately chose `no_changes` — and the admin sees a game that quietly forgets things. On top of that preference problem, the effort itself is undialable: every deepseek-row state round rides the row's default effort high on a multi-thousand-token tool-schema prompt, and `params: {}` means nobody can turn it down.

## Done when

A composed RPG round dials with the preset's effort on the wire (pinned, red-proved against an injected params drop); the structured and side-gen rounds state their posture in their contracts; the wire pin in tests/server/domain/rpg/tools/deepseek-state-round.suite.int.test.ts moves with the preset instead of pinning the default; a round whose reply was truncated by the output limit before it emitted its calls surfaces observably (a distinguishable trace/log outcome) instead of folding as a silent no-writes round; Spine-Config-and-Serialization consulted for where round params live.

## Evidence

Filled at landing: what ran and where its output is.
