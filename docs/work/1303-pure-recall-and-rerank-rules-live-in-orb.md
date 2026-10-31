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

Not moved: the `rerankPick` ban of the last speaker, the rank order of its pick, blank-name handling, the window clip and the abort. They are `rerankPick` rules over the role, the roster and the canon, and the rulings did not move them. A unit test would need a substitute reranker and roster, so they run composed in [rerank pick](../../tests/server/domain/chat/verbs/rerank-pick.suite.int.test.ts), through public `send` and `generate` over a physical rerank peer:

- Rank order: a line naming two characters is answered in the reranker's order. Planted change: the addressed characters keep mention order.
- The ban: a speakerless `generate` after the character's own line skips it in a room without self-responses; a room with self-responses and a human line both keep it. Planted changes: the ban is dropped; the ban ignores whether the line is the speaker's own.
- Blank names: a lone named seat answers with no rerank call; all-blank seats degrade with `speaker_rerank_unavailable`. Planted changes: blank seats are ranked; the all-blank degrade is not flagged.
- Window clip: each document on the wire fits the safe window of the bound model with its name intact. The backend clamps with the same rule at a wider budget, so only the pick's tighter budget is visible. Planted change: documents are not clipped in the pick.
- Stop: a Stop during a held rerank cancels the pick instead of degrading it. The rerank call carries no signal, so the pick sees the Stop when the held answer arrives, and the peer answers that call with a 500. The turn commits no speaker, foreground request or warning. Planted change: `cancelled()` always false, so the failed rerank degrades to a natural pick and the case fails on a `speaker_rerank_unavailable` warning.
