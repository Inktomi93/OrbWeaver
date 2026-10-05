# RPG structured state round: live results (work item 0511)

Run 2026-10-03 on branch `wt/agent-ac2270bb4049dd28e`. Every row in `results.jsonl` carries `tree.head` and
`tree.dirtyProduct`. Two trees were measured:

- **Baseline, `28ff5ad5fc`** (verifier round 6 CONFIRMED): the whole matrix.
- **After the fixes, `632f51c8ba`**: `af742f57af` (both delivery reasons show on the panel) and `791d5a7ba0` (several
  `update_scene` calls in one round merge field by field), merged with main. Every structured cell, the
  structured-unavailable cell and all swipe cells reran here.

No verdict below reads a row with `dirtyProduct: true`; the one such run (`vbzmd99e`, an early structured-unavailable
pass against another agent's uncommitted edits) is superseded. [`README.md`](README.md) describes how the probe drives
the production path; `node scripts/probes/rpg-structured-live/run.ts report` prints the tables below from
`results.jsonl` (latest run per cell and consumer, scored by the current checks).

## Verdict

The vehicle choice is right on every cell. Ollama native and KoboldCpp default mode take the structured round under
`auto`. llama.cpp, vLLM, Claude (direct and OpenRouter) and OpenAI stay on tools. Forcing `structured` takes the
structured round on llama.cpp, vLLM and Claude; Claude gets the patch list, the local rows get the union. Every
structured reply the decoder read became calls the shared fold applied.

State is stored per swipe on both vehicles: 48 of 48 swipe checks pass on six cells (vLLM, Claude and OpenAI on tools;
KoboldCpp, vLLM and Claude on the structured round).

Defects found and their status:

1. **Fixed in `791d5a7ba0`: the structured union lost split scene writes.** On the baseline, 12 of 79 structured
   rounds (every clean baseline run) split one beat's scene write across several `update_scene` entries, and in all
   12 an earlier entry carried a field the last one did not. The last-wins fold
   (`packages/contracts/src/rpg/extraction.ts:546-551` at `28ff5ad5fc`) dropped those fields (location, time, plot,
   recent event) without a warning. Tool rounds split the scene once in 112 rounds, with no field lost. After the
   fix, 7 of 77 structured rounds split the scene, and the panel kept the merged location in every one; a value a
   later call restated differently is now recorded as `salvaged` (seen once, on Claude's patch list).
2. **Open, environment: Ollama at its default window.** An unpinned Ollama model resolves to a 4096 window and the
   app sends `num_ctx: 4096`. The state round's prompt is about 3,300 to 3,500 tokens there, so the reply can run out
   at the window (`done_reason: "length"`, prompt 3,509 + 587 = 4,096). On the baseline that cost 12 of 16 turns; after
   the fix 3 of 16 (the fix does not touch it; the difference is how long the model's replies ran). The round fails
   loudly: `rpg.toolround.unparseable`, then `rpg.flush.dropped` with the reason on the turn's record. With the
   window a user declares under Advanced (16384), the same model passes 27 of 32 checks and the resync 5 of 5.
   Whether the round should budget its prompt against a small window, or the panel should say why capture failed, is
   an owner call.

Gemini is **pending: quota, item 0527**. The empty-round retry (`structured_fallback`) never fired live: every
downgraded tool round (Claude 5.5 sends `tool_choice: auto`) came back with usable calls, so that path is proven by
the recorded tests only.

## Matrix

"Turns pass" counts turns whose every check held; "checks" counts the individual checks (`scenario.ts`). A check
reads the panel after the turn's flush, so a miss is a model judgement unless the issues column names a loss.
"Retries" counts `structured_fallback` re-asks; "audits" counts the inventory pass. Latency is the state round's
wall time at the provider transport, median over the consumer's turns. The panel column is
`rpg.getGame().effectiveDelivery` when the game was set up. "Head" is the tree each row ran.

| cell | consumer | head | panel (path / reason) | vehicle used | turns pass | checks | retries / audits | drops and issues | state round ms (median) |
| - | - | - | - | - | - | - | - | - | - |
| vllm-qwen3.8-27b | folded | `28ff5ad5fc` | tool-round / local-engine-fold-guard | state-tools(tool_choice "required") | 6/8 | 13/16 | 0 / 1 | - | 10641 |
| vllm-qwen3.8-27b | cheap | `28ff5ad5fc` | tool-round / null | state-tools(tool_choice "required") | 6/8 | 14/16 | 0 / 0 | - | 10485 |
| vllm-qwen3.8-27b | resync | `28ff5ad5fc` | tool-round / null | state-tools(tool_choice "required") | 1/1 | 5/5 | 0 / 0 | - | 14054 |
| ollama-gemma4-e4b | folded | `632f51c8ba` | tool-round / local-engine-fold-guard | state-structured(ollama format union) | 3/8 | 7/16 | 0 / 1 | rpg.toolround.unparseable×2, rpg.flush.dropped×2, rpg.extraction.empty×1 | 2384 |
| ollama-gemma4-e4b | cheap | `632f51c8ba` | tool-round / null | state-structured(ollama format union) | 4/8 | 10/16 | 0 / 2 | rpg.toolround.unparseable×1, rpg.flush.dropped×1 | 1696 |
| ollama-gemma4-e4b | resync | `632f51c8ba` | tool-round / null | state-structured(ollama format union) | 0/1 | 2/5 | 0 / 0 | - | 677 |
| koboldcpp-gemma-4-e4b | folded | `632f51c8ba` | tool-round / local-engine-fold-guard | state-structured(response_format.json_schema union) | 7/8 | 15/16 | 0 / 0 | - | 5850 |
| koboldcpp-gemma-4-e4b | cheap | `632f51c8ba` | tool-round / null | state-structured(response_format.json_schema union) | 6/8 | 13/16 | 0 / 0 | - | 3302 |
| koboldcpp-gemma-4-e4b | resync | `632f51c8ba` | tool-round / null | state-structured(response_format.json_schema union) | 1/1 | 5/5 | 0 / 0 | - | 3164 |
| ollama-gemma4-e4b-window16k | folded | `632f51c8ba` | tool-round / local-engine-fold-guard | state-structured(ollama format union) | 6/8 | 12/16 | 0 / 0 | - | 2438 |
| ollama-gemma4-e4b-window16k | cheap | `632f51c8ba` | tool-round / null | state-structured(ollama format union) | 7/8 | 15/16 | 0 / 0 | - | 1646 |
| ollama-gemma4-e4b-window16k | resync | `632f51c8ba` | tool-round / null | state-structured(ollama format union) | 1/1 | 5/5 | 0 / 0 | - | 1745 |
| llamacpp-gemma-4-e4b | folded | `28ff5ad5fc` | tool-round / local-engine-fold-guard | state-tools(tool_choice "required") | 7/8 | 15/16 | 0 / 0 | rpg.extraction.stripped×1 | 9138 |
| llamacpp-gemma-4-e4b | cheap | `28ff5ad5fc` | tool-round / null | state-tools(tool_choice "required") | 7/8 | 15/16 | 0 / 1 | update_scene:salvaged×2, rpg.extraction.unparseable×2, rpg.extraction.empty×1 | 15589 |
| llamacpp-gemma-4-e4b | resync | `28ff5ad5fc` | tool-round / null | state-tools(tool_choice "required") | 0/1 | 4/5 | 0 / 0 | rpg.extraction.empty×1 | 7959 |
| llamacpp-gemma-4-e4b-structured | cheap | `632f51c8ba` | tool-round / null | state-structured(response_format.json_schema union) | 7/8 | 15/16 | 0 / 0 | - | 3219 |
| llamacpp-gemma-4-e4b-structured | resync | `632f51c8ba` | tool-round / null | state-structured(response_format.json_schema union) | 1/1 | 5/5 | 0 / 0 | - | 3031 |
| vllm-qwen3.8-27b-structured | cheap | `632f51c8ba` | tool-round / null | state-structured(response_format.json_schema union) | 7/8 | 14/16 | 0 / 0 | - | 10573 |
| vllm-qwen3.8-27b-structured | resync | `632f51c8ba` | tool-round / null | state-structured(response_format.json_schema union) | 1/1 | 5/5 | 0 / 0 | - | 8442 |
| anthropic-claude-sonnet-5-5 | folded | `28ff5ad5fc` | folded / null | folded (co-emitted on the character turn) | 8/8 | 16/16 | 0 / 0 | rpg.extraction.empty×1 | - |
| anthropic-claude-sonnet-5-5 | cheap | `28ff5ad5fc` | tool-round / null | state-tools(tool_choice {"type":"auto"}) | 8/8 | 16/16 | 0 / 1 | - | 4082 |
| anthropic-claude-sonnet-5-5 | resync | `28ff5ad5fc` | tool-round / null | state-tools(tool_choice {"type":"auto"}) | 1/1 | 5/5 | 0 / 0 | - | 6890 |
| anthropic-claude-sonnet-5-5-structured | cheap | `632f51c8ba` | tool-round / null | state-structured(output_config.format patch) | 8/8 | 16/16 | 0 / 3 | update_scene:salvaged×1, rpg.extraction.unparseable×1 | 5272 |
| openrouter-claude-sonnet-5.5 | folded | `28ff5ad5fc` | folded / null | folded (co-emitted on the character turn) | 8/8 | 16/16 | 0 / 0 | rpg.extraction.empty×1 | - |
| openrouter-claude-sonnet-5.5 | cheap | `28ff5ad5fc` | tool-round / null | state-tools(tool_choice "auto") | 8/8 | 16/16 | 0 / 2 | - | 4387 |
| openrouter-claude-sonnet-5.5 | resync | `28ff5ad5fc` | tool-round / null | state-tools(tool_choice "auto") | 1/1 | 5/5 | 0 / 0 | - | 6242 |
| openrouter-claude-sonnet-4.6 | folded | `28ff5ad5fc` | folded / null | folded (co-emitted on the character turn) | 5/8 | 11/16 | 0 / 0 | - | - |
| openrouter-claude-sonnet-4.6 | cheap | `28ff5ad5fc` | tool-round / null | state-tools(tool_choice "required") | 7/8 | 15/16 | 0 / 2 | update_scene:salvaged×1, rpg.extraction.unparseable×1 | 10817 |
| openrouter-claude-sonnet-4.6 | resync | `28ff5ad5fc` | tool-round / null | state-tools(tool_choice "required") | 1/1 | 5/5 | 0 / 0 | - | 9709 |
| openai-gpt-5.5 | folded | `28ff5ad5fc` | folded / null | folded (co-emitted on the character turn) | 8/8 | 16/16 | 0 / 0 | rpg.extraction.empty×1 | - |
| openai-gpt-5.5 | cheap | `28ff5ad5fc` | tool-round / null | state-tools(tool_choice "required") | 8/8 | 16/16 | 0 / 0 | rpg.extraction.empty×1 | 2901 |
| openai-gpt-5.5 | resync | `28ff5ad5fc` | tool-round / null | state-tools(tool_choice "required") | 1/1 | 5/5 | 0 / 0 | - | 2498 |
| koboldcpp-gemma-4-e4b-structured-unavailable | cheap | `632f51c8ba` | tool-round / null + structuredUnavailable | state-tools(tool_choice "auto") | 6/8 | 13/16 | 0 / 1 | rpg.toolround.vehicle_fallback×8, rpg.extraction.empty×1 | 4056 |
| gemini-3.8-flash | all | - | pending: quota, item 0527 | - | - | - | - | - | - |

Notes on the table:

- Every local row is fold-guarded (`tools.silencesProse` floors closed on an endpoint row), so its folded consumer
  runs the post-commit round and the panel says `local-engine-fold-guard`. The hosted rows co-emit, so their folded
  turns carry the calls on the character turn and run no state round.
- A `rpg.extraction.empty` on the quiet beat is the correct outcome and is left out of the issues column.
- The resync runs on the cheap game after its eight turns, so it checks that a rebuild leaves the story's end state.

## Baseline: the structured cells before the fixes (`28ff5ad5fc`)

Kept for comparison. The tool cells did not rerun: the fixes touch the panel and the shared scene fold, and tool
rounds split the scene once in 112 rounds with no field lost.

| cell | consumer | panel | vehicle used | turns pass | checks | retries / audits | drops/issues | state ms median |
| - | - | - | - | - | - | - | - | - |
| ollama-gemma4-e4b | folded | tool-round / local-engine-fold-guard | state-structured(ollama format union) | 2/8 | 5/16 | 0 / 0 | rpg.toolround.unparseable×6, rpg.flush.dropped×6 | 3421 |
| ollama-gemma4-e4b | cheap | tool-round / null | state-structured(ollama format union) | 1/8 | 4/16 | 0 / 0 | rpg.toolround.unparseable×6, rpg.flush.dropped×6 | 2791 |
| ollama-gemma4-e4b | resync | tool-round / null | state-structured(ollama format union) | 0/1 | 2/5 | 0 / 0 | rpg.extraction.empty×1 | 3847 |
| koboldcpp-gemma-4-e4b | folded | tool-round / local-engine-fold-guard | state-structured(response_format.json_schema union) | 7/8 | 14/16 | 0 / 0 | - | 2770 |
| koboldcpp-gemma-4-e4b | cheap | tool-round / null | state-structured(response_format.json_schema union) | 5/8 | 11/16 | 0 / 1 | - | 3842 |
| koboldcpp-gemma-4-e4b | resync | tool-round / null | state-structured(response_format.json_schema union) | 0/1 | 4/5 | 0 / 0 | - | 5151 |
| ollama-gemma4-e4b-window16k | folded | tool-round / local-engine-fold-guard | state-structured(ollama format union) | 7/8 | 15/16 | 0 / 0 | - | 7510 |
| ollama-gemma4-e4b-window16k | cheap | tool-round / null | state-structured(ollama format union) | 6/8 | 12/16 | 0 / 2 | rpg.extraction.empty×1 | 8745 |
| ollama-gemma4-e4b-window16k | resync | tool-round / null | state-structured(ollama format union) | 0/1 | 4/5 | 0 / 0 | rpg.extraction.empty×1 | 4363 |
| llamacpp-gemma-4-e4b-structured | cheap | tool-round / null | state-structured(response_format.json_schema union) | 7/8 | 14/16 | 0 / 0 | - | 3271 |
| llamacpp-gemma-4-e4b-structured | resync | tool-round / null | state-structured(response_format.json_schema union) | 1/1 | 5/5 | 0 / 0 | - | 3098 |
| vllm-qwen3.8-27b-structured | cheap | tool-round / null | state-structured(response_format.json_schema union) | 5/8 | 11/16 | 0 / 2 | - | 10969 |
| vllm-qwen3.8-27b-structured | resync | tool-round / null | state-structured(response_format.json_schema union) | 0/1 | 4/5 | 0 / 0 | - | 9022 |
| anthropic-claude-sonnet-5-5-structured | cheap | tool-round / null | state-structured(output_config.format patch) | 8/8 | 16/16 | 0 / 2 | - | 5307 |

## structured-unavailable

The KoboldCpp row with `output.structured: false` declared and the knob on `structured` runs the round as tool calls
(`tool_choice: auto`; KoboldCpp forces nothing). Every turn logs `rpg.toolround.vehicle_fallback` with
`code: "structured-unavailable"`, and the panel reports `effectiveDelivery.structuredUnavailable: true` beside the
fold reason (`af742f57af` shows both reasons). Measured on `632f51c8ba`.

## Swipes: state is stored per variant

Owner requirement. One game per cell, `cheap` mode, through `chat.send`, `chat.swipe` and `chat.selectVariant`. A
guided steer makes each variant write different state: turn N buys a rope (variant A) or, swiped, a dagger (B); turn
N+1 goes to the stables (C) or, regenerated, the chapel (D). After every step the probe reads the panel the selected
lineage resolves to and diffs it against the previous step. The checks are storage checks, not steer-following: a
variant's panel must equal the state it built on plus its own state round's writes, with nothing from a sibling.
Where a model's round wrote no location (vLLM structured's C, KoboldCpp's D), the panel correctly keeps the base
location, and where KoboldCpp's D removed the rope itself, the rope is correctly gone.

- (a) the swiped variant shows base + its own writes only; nothing of the abandoned variant;
- (b) switching back to the first swipe restores its panel byte for byte;
- (c) turn N+1 builds on the selected swipe's state;
- (d) regenerating N+1 builds on the same state, drops the regenerated sibling's writes, and switching back restores
  the sibling exactly.

All 48 checks pass on all six cells, on `632f51c8ba`. No mismatch, so no defect.

#### vllm-qwen3.8-27b swipes

- PASS (a) B shows base + B only
- PASS (a) A showed base + A only
- PASS (b) back to A restores A exactly
- PASS (c) N+1 builds on A
- PASS (c) N+1 shows its own location write
- PASS (d) regenerated N+1 keeps A, drops C
- PASS (d) regenerated N+1 shows its own location write
- PASS (d) back to C restores C exactly

| step | vehicle | flush | diff from the previous step |
| - | - | - | - |
| base | cheap tool round | wrote | (first step) |
| N variant A (rope) | cheap tool round | wrote | inventory: [] → ["Coil of Sturdy Hemp Rope"] |
| N variant B (dagger), swiped | cheap tool round | wrote | inventory: ["Coil of Sturdy Hemp Rope"] → ["Silver Dagger"] |
| N back to variant A | - | - | inventory: ["Silver Dagger"] → ["Coil of Sturdy Hemp Rope"] |
| N+1 variant C (stables) on A | cheap tool round | wrote | location: "Copper Lantern inn, Ashford" → "Stables behind the Copper Lantern inn, Ashford"<br>clock: "{\"day\":1,\"hour\":18,\"minute\":0}" → "{\"day\":1,\"hour\":0,\"minute\":0}" |
| N+1 variant D (chapel), regenerated | cheap tool round | wrote | location: "Stables behind the Copper Lantern inn, Ashford" → "St. Elowen's Chapel, Ashford"<br>present: ["Marta"] → [] |
| N+1 back to variant C | - | - | location: "St. Elowen's Chapel, Ashford" → "Stables behind the Copper Lantern inn, Ashford"<br>present: [] → ["Marta"] |

#### koboldcpp-gemma-4-e4b swipes

- PASS (a) B shows base + B only
- PASS (a) A showed base + A only
- PASS (b) back to A restores A exactly
- PASS (c) N+1 builds on A
- PASS (c) N+1 shows its own location write
- PASS (d) regenerated N+1 keeps A, drops C
- PASS (d) regenerated N+1 shows its own location write
- PASS (d) back to C restores C exactly

| step | vehicle | flush | diff from the previous step |
| - | - | - | - |
| base | structured state round | wrote | (first step) |
| N variant A (rope) | structured state round | wrote | inventory: [] → ["Coil of Rope"] |
| N variant B (dagger), swiped | structured state round | wrote | inventory: ["Coil of Rope"] → ["Silver Dagger"] |
| N back to variant A | - | - | inventory: ["Silver Dagger"] → ["Coil of Rope"] |
| N+1 variant C (stables) on A | structured state round | wrote | location: "Copper Lantern inn in Ashford" → "Stables behind the Copper Lantern inn"<br>clock: "{\"day\":1,\"hour\":18,\"minute\":0}" → "{\"day\":1,\"hour\":0,\"minute\":0}" |
| N+1 variant D (chapel), regenerated | structured state round | wrote | location: "Stables behind the Copper Lantern inn" → "Copper Lantern inn in Ashford"<br>inventory: ["Coil of Rope"] → [] |
| N+1 back to variant C | - | - | location: "Copper Lantern inn in Ashford" → "Stables behind the Copper Lantern inn"<br>inventory: [] → ["Coil of Rope"] |

#### vllm-qwen3.8-27b-structured swipes

- PASS (a) B shows base + B only
- PASS (a) A showed base + A only
- PASS (b) back to A restores A exactly
- PASS (c) N+1 builds on A
- PASS (c) N+1 shows its own location write
- PASS (d) regenerated N+1 keeps A, drops C
- PASS (d) regenerated N+1 shows its own location write
- PASS (d) back to C restores C exactly

| step | vehicle | flush | diff from the previous step |
| - | - | - | - |
| base | structured state round | wrote | (first step) |
| N variant A (rope) | structured state round | wrote | inventory: ["Leather satchel"] → ["Leather satchel","Coil of Hemp Rope"]<br>resolve: "steady" → "settled" |
| N variant B (dagger), swiped | structured state round | wrote | inventory: ["Leather satchel","Coil of Hemp Rope"] → ["Leather satchel","Silver Dagger"]<br>resolve: "settled" → "steady" |
| N back to variant A | - | - | inventory: ["Leather satchel","Silver Dagger"] → ["Leather satchel","Coil of Hemp Rope"]<br>resolve: "steady" → "settled" |
| N+1 variant C (stables) on A | structured state round | wrote | clock: "{\"day\":1,\"hour\":18,\"minute\":0}" → "{\"day\":1,\"hour\":0,\"minute\":0}"<br>resolve: "settled" → "contemplative" |
| N+1 variant D (chapel), regenerated | structured state round | wrote | location: "The Copper Lantern inn, Ashford" → "The Chapel of Saint Aldric, Ashford"<br>resolve: "contemplative" → "settled" |
| N+1 back to variant C | - | - | location: "The Chapel of Saint Aldric, Ashford" → "The Copper Lantern inn, Ashford"<br>resolve: "settled" → "contemplative" |

#### anthropic-claude-sonnet-5-5 swipes

- PASS (a) B shows base + B only
- PASS (a) A showed base + A only
- PASS (b) back to A restores A exactly
- PASS (c) N+1 builds on A
- PASS (c) N+1 shows its own location write
- PASS (d) regenerated N+1 keeps A, drops C
- PASS (d) regenerated N+1 shows its own location write
- PASS (d) back to C restores C exactly

| step | vehicle | flush | diff from the previous step |
| - | - | - | - |
| base | cheap tool round | wrote | (first step) |
| N variant A (rope) | cheap tool round | wrote | inventory: [] → ["Coil of rope"] |
| N variant B (dagger), swiped | cheap tool round | wrote | inventory: ["Coil of rope"] → ["Silver dagger"] |
| N back to variant A | - | - | inventory: ["Silver dagger"] → ["Coil of rope"] |
| N+1 variant C (stables) on A | cheap tool round | wrote | location: "The Copper Lantern inn, Ashford — common room" → "Stables behind the Copper Lantern, Ashford"<br>clock: "{\"day\":1,\"hour\":18,\"minute\":0}" → "{\"day\":1,\"hour\":0,\"minute\":0}"<br>present: ["Marta"] → []<br>resolve: null → "contemplative" |
| N+1 variant D (chapel), regenerated | cheap tool round + cheap inventory audit | wrote | location: "Stables behind the Copper Lantern, Ashford" → "Ashford village chapel — quiet interior"<br>resolve: "contemplative" → null |
| N+1 back to variant C | - | - | location: "Ashford village chapel — quiet interior" → "Stables behind the Copper Lantern, Ashford"<br>resolve: null → "contemplative" |

#### anthropic-claude-sonnet-5-5-structured swipes

- PASS (a) B shows base + B only
- PASS (a) A showed base + A only
- PASS (b) back to A restores A exactly
- PASS (c) N+1 builds on A
- PASS (c) N+1 shows its own location write
- PASS (d) regenerated N+1 keeps A, drops C
- PASS (d) regenerated N+1 shows its own location write
- PASS (d) back to C restores C exactly

| step | vehicle | flush | diff from the previous step |
| - | - | - | - |
| base | structured state round | wrote | (first step) |
| N variant A (rope) | structured state round | wrote | inventory: [] → ["Coil of rope"]<br>resolve: null → "steady" |
| N variant B (dagger), swiped | structured state round | wrote | inventory: ["Coil of rope"] → ["Silver dagger"]<br>resolve: "steady" → null |
| N back to variant A | - | - | inventory: ["Silver dagger"] → ["Coil of rope"]<br>resolve: null → "steady" |
| N+1 variant C (stables) on A | structured state round + structured inventory audit | wrote | location: "The Copper Lantern inn, Ashford" → "Stables behind the Copper Lantern inn, Ashford"<br>clock: "{\"day\":1,\"hour\":18,\"minute\":0}" → "{\"day\":1,\"hour\":0,\"minute\":0}"<br>present: ["Marta"] → [] |
| N+1 variant D (chapel), regenerated | structured state round | wrote | location: "Stables behind the Copper Lantern inn, Ashford" → "Village chapel, Ashford" |
| N+1 back to variant C | - | - | location: "Village chapel, Ashford" → "Stables behind the Copper Lantern inn, Ashford" |

#### openai-gpt-5.5 swipes

- PASS (a) B shows base + B only
- PASS (a) A showed base + A only
- PASS (b) back to A restores A exactly
- PASS (c) N+1 builds on A
- PASS (c) N+1 shows its own location write
- PASS (d) regenerated N+1 keeps A, drops C
- PASS (d) regenerated N+1 shows its own location write
- PASS (d) back to C restores C exactly

| step | vehicle | flush | diff from the previous step |
| - | - | - | - |
| base | cheap tool round | wrote | (first step) |
| N variant A (rope) | cheap tool round | wrote | inventory: [] → ["Coil of rope"] |
| N variant B (dagger), swiped | cheap tool round | wrote | inventory: ["Coil of rope"] → ["Silver dagger"] |
| N back to variant A | - | - | inventory: ["Silver dagger"] → ["Coil of rope"] |
| N+1 variant C (stables) on A | cheap tool round + cheap inventory audit | wrote | location: "Copper Lantern inn, Ashford" → "stables behind the Copper Lantern inn, Ashford"<br>clock: "{\"day\":1,\"hour\":18,\"minute\":0}" → "{\"day\":1,\"hour\":0,\"minute\":0}"<br>present: ["Marta"] → [] |
| N+1 variant D (chapel), regenerated | cheap tool round + cheap inventory audit | wrote | location: "stables behind the Copper Lantern inn, Ashford" → "village chapel, Ashford" |
| N+1 back to variant C | - | - | location: "village chapel, Ashford" → "stables behind the Copper Lantern inn, Ashford" |

## Defects

The two 0511 findings are in the verdict. Observed but not 0511's: a tracker `delta` on an unset meter starts from 0,
so `stamina` (max 10) reads -3 after the labour turn (`packages/server/src/domain/rpg/tools/apply.ts:141`). The Anthropic connection's model-list read 400s
with `anthropic-version: header is required` (`catalog:endpoint:https://api.anthropic.com…#list`); turns are
unaffected.

## What OpenRouter forwarded

From the `upstream` field (`debug.echo_upstream_body`, streaming re-send of the first state round per consumer):

- `anthropic/claude-sonnet-5.5`: `tool_choice: {type: auto}`, the seven state tools, `thinking: {type: adaptive,
  display: summarized}`, `output_config: {effort: high}`, `max_tokens` 2048 on the folded character turn and 65536 on
  the cheap round. The app sends `tool_choice: auto` because the row cannot be forced.
- `anthropic/claude-sonnet-4.6`: `tool_choice: {type: any}` on the cheap round (the app's `required`), `auto` on the
  folded turn, no thinking.

## Exact launches

The engines ran twice, once per tree, with the same launches. Every instance below was torn down after each pass;
afterwards GPU 0 read 4,853 MiB (ComfyUI alone, never touched) and GPU 1 read 554 MiB, its baseline. The Ollama volume
was removed with its container, so the second pass pulled `gemma4:e4b` again.

vLLM 0.29.0 on GPU 1, the owner's launcher unchanged with the brief's overrides (later flags win):

```sh
CUDA_VISIBLE_DEVICES=1 setsid nohup ~/qwen-local/bin/serve-27b.sh \
  /media/inktomi/Data/vllm-models/quantized/Qwen3.8-27B-W8A8-Dynamic-Per-Token \
  --tensor-parallel-size 1 --max-model-len 32768 --max-num-seqs 64 --port 28941
```

llama.cpp on GPU 0 (`ghcr.io/ggml-org/llama.cpp:server-cuda`, `b11371`, image `f90b9de8baf5`):

```sh
docker run -d --name lane511-llamacpp --gpus '"device=0"' -p 127.0.0.1:28942:8080 \
  -v /media/inktomi/Data/vllm-models/gguf/lane492:/models:ro ghcr.io/ggml-org/llama.cpp:server-cuda \
  -m /models/gemma-4-E4B-it-Q8_0.gguf --alias gemma-4-e4b-it --jinja -ngl 99 -c 16384 --host 0.0.0.0 --port 8080 --no-webui
```

Ollama 0.35.1 on GPU 0, the model pulled from the Ollama library, server defaults (4096 window):

```sh
docker run -d --name lane511-ollama --gpus '"device=0"' -p 127.0.0.1:28943:11434 \
  -v lane511-ollama-data:/root/.ollama -e OLLAMA_HOST=0.0.0.0 ollama/ollama:latest
docker exec lane511-ollama ollama pull gemma4:e4b
```

KoboldCpp 1.122.1 on GPU 0 in default mode: no `--jinja`, no `--jinjatools` (`/api/extra/version` reported `"jinja":
false`). The connection declares tools under Advanced, because KoboldCpp states none.

```sh
docker run -d --name lane511-kobold --gpus '"device=0"' -p 127.0.0.1:28944:5001 \
  -v /media/inktomi/Data/vllm-models/gguf/lane492:/models:ro -e KCPP_DONT_TUNNEL=true \
  -e KCPP_ARGS="--model /models/gemma-4-E4B-it-Q8_0.gguf --host 0.0.0.0 --port 5001 --contextsize 16384 --usecuda --gpulayers 99 --quiet" \
  koboldai/koboldcpp:latest
```

The GGUF is `ggml-org/gemma-4-E4B-it-GGUF` `gemma-4-E4B-it-Q8_0.gguf`. The probe ran as:

```sh
PRIVATE_ENDPOINT_ALLOWLIST=127.0.0.1:28941,127.0.0.1:28942,127.0.0.1:28943,127.0.0.1:28944 \
  LOG_LEVEL=info node scripts/probes/rpg-structured-live/run.ts <cell>...
```

Hosted model ids as sent: `claude-sonnet-5-5` (Anthropic direct), `anthropic/claude-sonnet-5.5` and
`anthropic/claude-sonnet-4.6` (OpenRouter), `gpt-5.5` (OpenAI). Keys came from `.env` and are never printed.
