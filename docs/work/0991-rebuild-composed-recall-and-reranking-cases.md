---
kind: work
status: open
updated: 2026-10-24
priority: P2
area: inference
plan: restoration-register
---

# Rebuild composed recall and reranking cases

## What

Rebuild recall and reranking cases through composed search, databank and chat operations. Seed through production generation and corpus writes. Script the provider embedding edge; keep actual model calls opt-in.

## Why

Copied search and chat contexts cannot establish production ownership, scoping or vector behavior.

## Done when

Preserve text and late-closing recall, Smart and databank cuts, omnibox targets, speaker cuts, reach, seed upgrade, user choice, reboot, cold and token cases. A deterministic composed test fails on a production scoping or rerank defect. Keep live engine calls opt-in.

## Case map

The done line names the cases of the removed `scripts/probes/reranker-live/run.ts` (last at `821e8f8dff^`). Its copied search and chat contexts are not restored. Legacy paths below are relative to the external reference source named in [Spine-Testing](../law/Spine-Testing.md#2-the-tree).

New maintained homes:

- [Rerank consumers](../../tests/server/domain/search/verbs/rerank-consumers.suite.int.test.ts) builds rows through production turns, memory builds, workloads and databank writes. Scripted vectors put the wanted item last; a physical `/v1/rerank` answer scores a document by whether the fact reached it. Each case runs for a fact in the lead (`text`) and a fact only in the late closing (`needle`).
- [Seed upgrade](../../tests/server/domain/connection/persistence/local-light-seed-upgrade.int.test.ts) writes rows an earlier release left and runs the production per-account seed the boot sweep runs.
- [Recall recorder](../../tests/server/domain/chat/memory/recall/recorder.test.ts) and the rerank window case in [capability contracts](../../tests/contracts/inference/capability/capability.contract.test.ts).

### Probe cases

| Case | Primary home | Decision |
| - | - | - |
| Text and late-closing memory recall (mixC) | Rerank consumers: the reranked arc is admitted first, the fact reaches the prompt, and the prompt reads arcs oldest first; mixB makes no rerank call and keeps vector order. | Rebuild |
| Smart speaker pick | Rerank consumers: the character whose persona leads with the fact speaks. | Rebuild for `text`. Drop `needle`: Smart reads a card's leading sentences by design (`engine/character-line.ts`). |
| Databank cut | Rerank consumers: with `k` 1 the reranked chunk alone reaches the prompt, never another room's or another account's document; with rerank off the vector-first chunk wins. | Rebuild |
| Omnibox targets: digests, segments, corpus, discover, entities, characters, documents | Rerank consumers: each target's first hit is the reranked item only with its switch on; another account's document never appears. | Rebuild |
| Omnibox images | Non-rerank arm in [corpus search](../../tests/support/node/corpus-search.int.test.ts); the rerank path is the shared `applyRerank` the other targets prove. | Keep. A caption-rerank case needs the image corpus producer. |
| Late closing past the reranker window | Rerank consumers: a 2048 window carries the closing to the wire; a 512 window clamps it away and the item loses first place. | Rebuild |
| Speaker-pick cuts (hand-judged hit rate) | Model-quality measurement on a live model; Smart rules live in [smart picker](../../tests/server/domain/chat/verbs/smart-picker.suite.int.test.ts). | Drop |
| Reach sweep and token counts | Measurements of one model's tokenizer and attention reach, not product behavior. | Drop |
| Seed: fresh install | Seed upgrade | Rebuild |
| Seed upgrade: earlier model in the slot, `seed_model` unwritten | Seed upgrade: the row moves in place, the binding follows and the earlier declared window is dropped. | Rebuild |
| Seed upgrade: unslotted row under the earlier label | Seed upgrade: adopted and relabelled. | Rebuild |
| The user's own earlier-model row | Seed upgrade: from a pre-slot state it is never adopted or moved and stays bound. | Rebuild |
| User choice, then reboot | Seed upgrade: a later pick of the earlier model on the seeded row survives the next seed run, for a fresh and an upgraded account. | Rebuild |
| Cold start with an empty model cache | Needs an opt-in `local-model-cache` case that downloads weights. | Deferred |

### Recall references

| Reference cases | Maintained evidence | Decision |
| - | - | - |
| `recall/recall.int.test.ts`: witnessing filter, kicked interval, horizons from participants, shared bucket witnessed, egocentric buckets | [Authority boundary rows](../../tests/server/domain/chat/persistence/authority-boundary-rows.int.test.ts): join, leave and rejoin horizons, `unwitnessed` shared blocks and the scoped prompt. [Scoped horizon](../../tests/server/domain/chat/memory/persistence/scoped-digest-horizon.int.test.ts) owns the build side. | Keep |
| `recall.int.test.ts`: mixC delegates to search, rerank-unavailable episode warning | [Core retrieval](../../tests/server/domain/chat/engine/core-retrieval.int.test.ts) and rerank consumers. | Keep |
| `recall.int.test.ts`: chronological injection after rank order | Rerank consumers. | Rebuild |
| `recall.int.test.ts` and `memory-recall-trace.suite.int.test.ts`: mode off, empty pool without embed, `maxTier`, tiered bridge, `bridge-covered` and `mode-excluded` verdicts, live-window boundary and straddle, fail-closed missing spans, shrink reclaim, recall phase events, surfaced counts | No maintained composed case. | Rebuild, deferred to a follow-up item |
| `memory-recall-eval.suite.int.test.ts`: recall at k, stable order, minScore floor, off-corpus query, knob controls (`queryWindow`, `retrieveK`, `rerankTo`), live window over relevance | mixB versus mixC divergence and the live window are in rerank consumers; the knob and floor controls are not. | Rebuild, deferred to the same follow-up item |
| `memory-recall-trace.suite.int.test.ts`: trace reaches the log and the recorder | The recorder sink is read by core retrieval and recall audits. | Keep |
| `recall/recorder.test.ts` | Recall recorder. | Rebuild |
| `recall/bridge.test.ts`, `format.test.ts`, `query.test.ts`, `window.test.ts` | Pure functions with no server door export. | Move to unit, deferred: a test-only door is rejected by the plan. |
| `engine/rerank-pick.test.ts` | Smart picker owns negative logits, unbound degrade, mentions and muted seats; rerank consumers owns the ranked pick. Ambiguous titles, common-word names, blank names, the window clip and abort rules have no door. | Keep the covered rules; the rest deferred with the unit move. |
| `search/substrate/rerank.test.ts` | Ordering is proved through every rerank consumer. Unscorable placement, omitted-hit order and rejection propagation have no door. | Keep ordering; the rest deferred with the unit move. |
| `inference/backends/openai-compat/rerank.test.ts` | The window clamp is proved by rerank consumers. The minimum-window refusal before send is not. | Keep the clamp; the refusal deferred. |
| `contracts/inference/capability/rerank.contract.test.ts` | Capability contracts: positive whole window, closed modalities. The floor's `windowEstimated` value only restates a constant. | Rebuild the refusals; drop the constant check. |

The legacy `server/domain/search/verbs/search.int.test.ts` defines omnibox scope cases. Its co-star, foreign chat, refusal and own-bank cases match [corpus search](../../tests/support/node/corpus-search.int.test.ts); this map does not classify the rest of it.

### Defect controls

Each scratch production change failed the named cases and was reverted.

| Change | Failed |
| - | - |
| `applyRerank` reads hits in reverse | Every rerank consumer case except Smart |
| `rankKeys` sorts ascending | Smart |
| openai-compat document budget cut to a quarter | Every `needle` case and the late-closing case; `text` cases pass |
| The room junction ignores its chat id | Databank cut, both shapes |
| `rerankOrKeep` skips the mixC rerank | Memory recall, both shapes |
| The seed move ignores `seed_model` | User choice, then reboot |
| Adoption ignores the seed's labels | The user's own earlier-model row |
| `maxInputTokens` accepts any number | Capability contracts |
| The recorder ignores its chat filter | Recall recorder |

Breaking only the databank owner predicate does not surface another account's document: the generation join pins each chunk to its owner's own connection fingerprint. Owner scope stays owned by [vector owner scope](../../tests/server/domain/search/persistence/vector-owner-scope.int.test.ts) and [current document scope](../../tests/server/domain/search/verbs/current-document-scope.int.test.ts).

## Evidence

Use maintained Node tests and existing production composition. Do not recreate a standalone probe or its copied contexts.
