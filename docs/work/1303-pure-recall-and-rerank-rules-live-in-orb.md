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

Rulings for the two rules still in the server:

- `buildRecallQuery`: split the pure rule from the rendering. Kit takes the rendered turn texts and returns the query; the server renders with `renderTranscript` and its error code, then calls kit. The hash stays server-side or moves to a kit hash over bytes, never `node:crypto` in kit.
- The `rerankPick` name and ambiguity rules: split the mention reader in `engine/select-speakers.ts` from its roster type. Kit takes a structural candidate (name, aliases, eligible) and the server maps its participants, with `isArbiterEligible` read at the caller.

## Why

The layer table puts pure logic in unit tests in @orb/kit and @orb/contracts; a test-only door export is banned, and driving pure rules through the composed root is the expensive layer for cheap permutations.

## Done when

Each pure rule moves to @orb/kit (or @orb/contracts where it is a contract rule) behind its existing door, the server imports it from there, and a unit test covers the reference cases with a defect control; no production export exists only for tests.

## Evidence

Moved to `@orb/kit/recall` ([source](../../packages/kit/src/recall/index.ts)): `computeBridge`, `tier0RangeOf`, `formatMemory`, `blockKeyStr`, `inLiveWindow` and `LIVE_WINDOW_FULL_HISTORY_CUTOFF`. Moved to `@orb/kit/rerank` ([source](../../packages/kit/src/rerank/index.ts)): `applyRerank`. The server imports them from there; `move-import-names` repointed 11 importers. `blockKeyStr` had a second copy in `domain/search/substrate/dedupe.ts`; the kit holds the one home.

Unit tests: [bridge](../../tests/kit/recall/bridge.test.ts), [format and window](../../tests/kit/recall/format-and-window.test.ts), [apply rerank](../../tests/kit/rerank/apply-rerank.test.ts). Each rule has a planted defect that failed its cases and was reverted; the table is in the 0991 defect controls.

Moved after the rulings above:

- `buildRecallQuery` split. `@orb/kit/recall` holds `recallQueryWindow` and `buildRecallQuery`, which takes the rendered window text. The server renders with `renderTranscript` and its chat error code in `recall/query.ts`, then calls kit. No `node:crypto` in kit.
- The name and ambiguity rules moved to `@orb/kit/speaker-address` ([source](../../packages/kit/src/speaker-address/index.ts)): `addressedGroups`, `nameMentionsOf` and their word rules. A candidate is `{ id, name, eligible }`. `engine/select-speakers.ts` maps its roster, reads `isArbiterEligible` there and calls kit; the `NameMention` and `LineAddress` shapes moved to kit and left `contract/arbitration.ts`. No importer changed, so the codemod had nothing to repoint here.
- The ruling named aliases on the candidate. No alias rule exists in the code, so the candidate carries none; an alias is a new behaviour for its own item.

Unit tests: [query](../../tests/kit/recall/query.test.ts), [address](../../tests/kit/speaker-address/address.test.ts). Ten planted defects each failed their cases and were reverted; the 0991 defect controls list them. The Smart picker suite, the mention turn suite and the recall pipeline suite pass on the moved code.

Not moved: the `rerankPick` ban of the last speaker, the rank order of its pick, blank-name handling, the window clip and the abort. They are `rerankPick` rules over the role and the roster, not name rules, and the rulings did not move them. The reference cases for them have no maintained case; they stay open in the 0991 map.
