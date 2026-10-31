---
kind: work
status: open
updated: 2026-10-24
priority: P3
area: inference
plan: restoration-register
---

# Pure recall and rerank rules live in @orb/kit with unit tests

## What

computeBridge, formatMemory, buildRecallQuery, inLiveWindow, the rerankPick name and ambiguity rules, applyRerank's unscorable placement (rejection propagation, omitted-hit order and the openai-compat minimum-window refusal are rebuilt in the composed rerank suite) are pure rules with no door, so they have no unit home.

## Why

The layer table puts pure logic in unit tests in @orb/kit and @orb/contracts; a test-only door export is banned, and driving pure rules through the composed root is the expensive layer for cheap permutations.

## Done when

Each pure rule moves to @orb/kit (or @orb/contracts where it is a contract rule) behind its existing door, the server imports it from there, and a unit test covers the reference cases with a defect control; no production export exists only for tests.

## Evidence

Moved to `@orb/kit/recall` ([source](../../packages/kit/src/recall/index.ts)): `computeBridge`, `tier0RangeOf`, `formatMemory`, `blockKeyStr`, `inLiveWindow` and `LIVE_WINDOW_FULL_HISTORY_CUTOFF`. Moved to `@orb/kit/rerank` ([source](../../packages/kit/src/rerank/index.ts)): `applyRerank`. The server imports them from there; `move-import-names` repointed 11 importers. `blockKeyStr` had a second copy in `domain/search/substrate/dedupe.ts`; the kit holds the one home.

Unit tests: [bridge](../../tests/kit/recall/bridge.test.ts), [format and window](../../tests/kit/recall/format-and-window.test.ts), [apply rerank](../../tests/kit/rerank/apply-rerank.test.ts). Each rule has a planted defect that failed its cases and was reverted; the table is in the 0991 defect controls.

Open, with the reason:

- `buildRecallQuery` stays in the server. It renders the query text through `renderTranscript`, which throws a chat error and hashes with `node:crypto`. A kit move needs a design call: inject the renderer, or move the renderer with its error code.
- The `rerankPick` name and ambiguity rules stay in the server. They live in the mention reader of `engine/select-speakers.ts`, shared with `smart-arbitrate.ts`, and read `isArbiterEligible` from participant persistence. A kit move needs that reader split from its roster type first.
