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

The done line preserves the reranker-live probe's behavior cases, available in Git at `821e8f8dff^`. Rebuild through production composition without its copied search and chat contexts. Legacy paths below are relative to the external reference source named in [Spine-Testing](../law/Spine-Testing.md#2-the-tree).

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
| Omnibox targets: digests, segments, corpus, discover, entities, characters, documents | Rerank consumers: each target's first hit is the reranked item only with its switch on; another account's document never appears, while that account's own search reaches it. | Rebuild |
| Omnibox images | Non-rerank case in [corpus search](../../tests/support/node/corpus-search.int.test.ts); the rerank path is the shared `applyRerank` the other targets prove. | Keep. A caption-rerank case needs the image corpus producer. |
| Late closing past the reranker window | Rerank consumers: a 2048 window carries the closing to the wire; a 512 window clamps it away and the item loses first place. | Rebuild |
| Speaker-pick cuts (hand-judged hit rate) | Model-quality measurement on a live model; Smart rules live in [smart picker](../../tests/server/domain/chat/verbs/smart-picker.suite.int.test.ts). | Drop |
| Reach sweep and token counts | Measurements of one model's tokenizer and attention reach, not product behavior. | Drop |
| Seed: fresh install | Seed upgrade | Rebuild |
| Seed upgrade: earlier model in the slot, `seed_model` unwritten | Seed upgrade: the row moves in place, the binding follows and the earlier declared window is dropped. | Rebuild |
| Seed upgrade: unslotted row under the earlier label | Seed upgrade: adopted and relabelled. | Rebuild |
| The user's own earlier-model row | Seed upgrade: from a pre-slot state it is never adopted or moved and stays bound. | Rebuild |
| User choice, then reboot | Seed upgrade: a later pick of the earlier model on the seeded row survives the next seed run, for a fresh and an upgraded account. | Rebuild |
| Cold start with an empty model cache | [Cold cache](../../tests/server/domain/connection/local-light-cold-cache.suite.int.test.ts): a root with an empty model cache runs the boot seed, then the first rerank downloads the seeded model through the shipped loader. It runs only under the `local-model-cache` tag. | Rebuild, opt-in ([item 1304](1304-an-opt-in-cold-cache-reranker-case-downloads.md)) |
| Live sanity pair ("Which planet is known as the Red Planet?") | The cold cache case ranks the answering document first after the download. | Rebuild, opt-in: the served-model check of the cold case |
| Per-call latency, first-call time and RSS | Device measurements; no product assertion. | Drop |

### Recall references

| Reference cases | Maintained evidence | Decision |
| - | - | - |
| `recall/recall.int.test.ts`: witnessing filter, kicked interval, horizons from participants, shared bucket witnessed, egocentric buckets | [Authority boundary rows](../../tests/server/domain/chat/persistence/authority-boundary-rows.int.test.ts): join, leave and rejoin horizons, `unwitnessed` shared blocks and the scoped prompt. [Scoped horizon](../../tests/server/domain/chat/memory/persistence/scoped-digest-horizon.int.test.ts) owns the build side. | Keep |
| `recall.int.test.ts`: mixC delegates to search, rerank-unavailable episode warning | [Core retrieval](../../tests/server/domain/chat/engine/core-retrieval.int.test.ts) and rerank consumers. | Keep |
| `recall.int.test.ts`: chronological injection after rank order | Rerank consumers. | Rebuild |
| `recall.int.test.ts`: the full distilled text body reaches `{{memory}}`, not only the anchor and keywords | Rerank consumers: the fact sits in the digest body, below its anchor line, and reaches the prompt. | Keep |
| `recall.int.test.ts`: mixA pure assembly without a search call, the mode-switch union of the shared and own eras, no retroactive omniscience for the group character | [Recall pipeline](../../tests/server/domain/chat/memory/recall-pipeline.suite.int.test.ts): mixA lists every tier-0 block in chronological order and embeds no query. A two-character room built by the production backfill holds a shared bucket and one bucket per character: a scoped speaker's recalls read the shared bucket and its own, never the other speaker's, and a merged speaker's recall reads only the shared bucket. | Rebuild |
| `recall.int.test.ts` and `memory-recall-trace.suite.int.test.ts`: mode off, empty pool without embed, `maxTier`, tiered bridge, `bridge-covered` and `mode-excluded` verdicts, live-window boundary and straddle, fail-closed missing spans, shrink reclaim, recall phase events, surfaced counts | [Recall pipeline](../../tests/server/domain/chat/memory/recall-pipeline.suite.int.test.ts) reads each turn's trace from the recall recorder. Mode off and the empty pool embed no query. The `maxTier` ceiling, the tiered bridge, the two verdicts and the surfaced count are asserted on the trace. The live window outranks relevance: a turn after a whole-history turn drops every scene. Shrink reclaim hides the room's last two messages through `setMessageHidden`, reruns `memory-backfill` and reads the held digest blocks through the omnibox digest search: the last block is gone and the rest stay. The exact live-window boundary is `inLiveWindow` in [kit](../../tests/kit/recall/format-and-window.test.ts). A tier-1 straddle needs the previous turn's token fit to land its cutoff inside a block, which a test cannot place. Fail-closed missing spans need a digest with no stored segment span: a late joiner's post-join digests all had spans before any manual index sweep, so the product indexes each block it digests, and a span-less digest is a storage state only a persistence suite can write. Recall phase events are live bus events (`seq` null) a test reads from the transport stream, as [recipient isolation](../../tests/server/transport/trpc/stream/recipient-isolation.int.test.ts) does; no case here subscribes. | Rebuild for mode off, empty pool, `maxTier`, tiered bridge, both verdicts, the live window, surfaced counts and shrink reclaim. Open for the straddle, fail-closed missing spans and phase events: [item 1302](1302-rebuild-the-remaining-recall-pipeline-cases-through-the.md) |
| `memory-recall-eval.suite.int.test.ts`: recall at k, stable order, minScore floor, off-corpus query, knob controls (`queryWindow`, `retrieveK`, `rerankTo`), live window over relevance | mixB versus mixC divergence and the live window are in rerank consumers. [Recall pipeline](../../tests/server/domain/chat/memory/recall-pipeline.suite.int.test.ts): the graded `minScore` floor with the keyword fold as its control, the off-corpus query with every candidate below the floor, `queryWindow`, `retrieveK` and `rerankTo` each flipping the admitted set. Recall at k over a labelled set restates the cosine the search suites own and is dropped. | Rebuild; drop recall at k |
| `memory-recall-trace.suite.int.test.ts`: trace reaches the log and the recorder | The recorder sink is read by core retrieval and recall audits. | Keep |
| `recall/recorder.test.ts` | Recall recorder. | Rebuild |
| `recall/bridge.test.ts`, `format.test.ts`, `window.test.ts` | [Bridge](../../tests/kit/recall/bridge.test.ts) and [format and window](../../tests/kit/recall/format-and-window.test.ts) call `@orb/kit/recall`: coverage walk, per-bucket grids, tier ranges, blank and missing bodies, the live-window boundary and the whole-history cutoff. | Move ([item 1303](1303-pure-recall-and-rerank-rules-live-in-orb.md)) |
| `recall/query.test.ts` | [Query](../../tests/kit/recall/query.test.ts) calls `buildRecallQuery` and `recallQueryWindow` from `@orb/kit/recall`: scope, bucket, each knob, no candidate restriction and the window. The server renders the window text with the chat's transcript renderer. | Move ([item 1303](1303-pure-recall-and-rerank-rules-live-in-orb.md)) |
| `engine/rerank-pick.test.ts`: score scales, unbound and failing roles, a named character winning, a muted mention | Smart picker owns negative logits, unbound degrade, mentions and muted seats; rerank consumers owns the ranked pick. | Keep |
| `engine/rerank-pick.test.ts`: the last-speaker ban and its lift after a human line, rank order across several addressed characters, a name a human player shares, ambiguous titles, common-word names, blank names, the window clip and abort | [Address](../../tests/kit/speaker-address/address.test.ts) calls `addressedGroups` and `nameMentionsOf` from `@orb/kit/speaker-address`: shared titles, common-word and lowercase names, the fuller name winning, several addressed characters in mention order, a name a human player shares, self naming, ineligible seats. The ban and its lift, the rank order of the pick, blank names, the window clip and abort are `rerankPick` rules over the role and the roster, not name rules. They stay in the server and no maintained case holds them. | Move for the name and ambiguity rules. Open for the rest: [item 1303](1303-pure-recall-and-rerank-rules-live-in-orb.md) |
| `search/substrate/rerank.test.ts`: reorder by hit order, omitted hits after the scored ones in vector order, rejection propagation | Rerank consumers: every consumer's order; a reply naming only the fact's documents leaves the rest in their vector order; a 500 from the engine fails the omnibox search. | Rebuild |
| `search/substrate/rerank.test.ts`: unscorable candidates placed last | A production row with blank source text is not reachable through a write path. [Apply rerank](../../tests/kit/rerank/apply-rerank.test.ts) calls `applyRerank` from `@orb/kit/rerank`, with the omitted-hit order and the rejection as controls. | Move |
| `inference/backends/openai-compat/rerank.test.ts` | Rerank consumers: the window clamp, and a reranker bound at the minimum window refused with no request sent. | Rebuild |
| `contracts/inference/capability/rerank.contract.test.ts` | Capability contracts: positive whole window, closed modalities. The floor's `windowEstimated` value only restates a constant, and a measured window parsing with the flag false only restates an optional boolean field. | Rebuild the refusals; drop the two flag checks. |

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
| `recallMemory` skips its mode-off return | Recall pipeline: mode off |
| `recallMemory` skips its empty-pool return | Recall pipeline: empty pool |
| The surfaced count is one too high | Five recall pipeline cases and the mode and empty-pool cases |
| The `maxTier` ceiling filter is dropped | Recall pipeline: the ceiling |
| The live-window drop is skipped | Recall pipeline: the live window and the tiered bridge |
| The bridge or mode verdict is mislabelled | Recall pipeline: tiered and mixA verdicts |
| `buildRecallQuery` ignores `minScore`, `queryWindow`, `retrieveK` or `rerankTo`, or forces `keywordMatch` on | The matching recall pipeline knob case |
| The query window ignores `queryWindow`, or the query drops a knob or scopes to another key | Query unit cases |
| A lowercase common word names a character, an ineligible or self-named character is addressed, overlapping names never group, a tie keeps the weaker names, human words never shield, or stopwords name | The matching address unit case |
| The shrink reclaim keeps blocks past the ceiling | Recall pipeline: shrink reclaim |
| Recall drops the shared bucket, or reads only the shared bucket | Recall pipeline: the scoped and merged speakers |
| The seed move ignores `seed_model` | User choice, then reboot |
| Adoption ignores the seed's labels | The user's own earlier-model row |
| `maxInputTokens` accepts any number | Capability contracts |
| The recorder ignores its chat filter | Recall recorder |
| The bridge walk advances one position instead of one span | Four bridge unit cases |
| The bridge merges buckets under one owner | The two per-bucket bridge unit cases |
| The live window compares with `>` | The boundary unit case |
| The format keeps a blank body | The blank-body unit case |
| `applyRerank` places unscorable candidates first, or reverses the omitted hits | The unscorable and omitted-hit unit cases |
| `applyRerank` swallows a failed rerank call | The failed-rerank case: the search resolves in vector order |
| `applyRerank` reverses the hits the reranker left unscored | The unscored-order case |
| openai-compat sends a pair whose query clamps to nothing | The minimum-window case: the search resolves instead of refusing |
| Both owner guards dropped: the personal-scope predicate (`databank/persistence/scope.ts` `resolveActiveDocumentScope`) and the allowlist (`resolveActiveDocumentIds`) | Omnibox, late-closing, unscored-order, minimum-window and the stranger case, both shapes; [current document scope](../../tests/server/domain/search/verbs/current-document-scope.int.test.ts) fails too. The databank cut passes: the gather runs the chat-scope predicate. |

The two owner guards cover each other. With only the predicate dropped, the allowlist intersection in `search/persistence/nearest.ts` `nearestDocumentChunks` still excludes the stranger's document, and every case passes; with only the allowlist dropped, the predicate excludes it. Document owner scope is owned by current document scope and the rerank consumer cases above. [Vector owner scope](../../tests/server/domain/search/persistence/vector-owner-scope.int.test.ts) covers only corpus and discover digests and segments, and passes under the double break.

## Evidence

Use maintained Node tests and existing production composition. Do not recreate a standalone probe or its copied contexts.
