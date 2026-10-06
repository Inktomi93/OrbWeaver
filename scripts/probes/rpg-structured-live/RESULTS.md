# RPG structured state round: live results (work item 0511)

## Normalized image and embedding role acceptance

Run `nc1xa3vc` used the disposable production composition in `gemini-roles.ts` on `d9ff5c6704` plus the uncommitted H normalization and persistence source. Terminal handle `27383` exited **0**. All four role rows and the zero-failure summary are appended to [`gemini-role-results.jsonl`](gemini-role-results.jsonl); historical `6brka353` rows remain unchanged. This batch made exactly six successful POSTs: two image generations, three text embeddings and one image embedding. Catalog GETs are separate, and no provider retry or consumer confidence rerun occurred.

| bound model / role | raw reported facts | normalized, persisted and retrieved outcome |
| - | - | - |
| `gemini-3.1-flash-image` / Image | prompt 70, candidates 1453, total 1523; thoughts absent; served version `gemini-3.1-flash-image` | input 70, output 1453, reasoning unknown; partial IMAGE detail 1120; valid JPEG, 340358 bytes, 1024×1024 |
| `gemini-3-pro-image` / Image | prompt 70, candidates 1203, thoughts 197, total 1470; served version `gemini-3-pro-image` | input 70, output **1400**, with reasoning 197 included once; partial IMAGE detail 1120; valid JPEG, 354496 bytes, 1024×1024 |
| `gemini-embedding-2` / Embedding | three prompt counts 34, 30 and 15; total and served version absent | three owner-scoped physical-batch canon rows preserve those counts; two persisted same-space 768-wide finite, unit-normal vectors; relevant banana grower .812721878 ranks above unrelated physicist .566691309 |
| `gemini-embedding-2` / Image embedding | one image input, prompt 258; total and served version absent | normalized prompt 258 and one owner-scoped image-embedding call row; finite, unit-normal 768-wide vector |

Both Image bindings used native `responseModalities: [TEXT, IMAGE]` and `imageConfig.aspectRatio: 1:1`. The resolver used the advertised Flash-image 65536 input/output limits rather than the stale curated smaller output guess; Pro-image resolved 131072 input / 32768 output. Saved bytes under `/tmp/h-gemini-roles-RFXVhr/` were retrieved through the owned asset service, MIME-sniffed, decoded and successfully transformed. Each image's actual raw served version, counts and partial modality details matched its canonical provenance read-back. IMAGE detail entries do not exhaust output totals; no omitted modality was invented.

Embedding requests actually sent `outputDimensionality: 768` and no `taskType`; the resolved retrieval scaffold remains the adapter's text contract. Every returned width was 768. Canon rows match completed physical SDK batches, not the number of persisted vectors. Missing total usage and served version remain null, never copied from the requested model or fabricated from prompt counts. The image input reached the existing native image-embedding adapter; this is not a claim that all advertised audio/video/file inputs are wired.

These were standard native API calls, not a batch-priced invocation. No configured rates or provider invoice amounts were present: image and embedding costs remain **null / unrecorded**, not billed zero. Image modality and resolution pricing cannot be represented by pretending one text-token rate applies universally. Cache-read counts were absent; image cache-write zero is applicability-derived under GenerateContent's billable-input-subset contract, not a wire-reported cache creation or storage charge. No managed cache resource was created.

Credentials came through the existing private loader after unsetting ambient `GEMINI_PROBE_KEY`; the worktree `.env` is a symlink to MAIN's `.env`. The disposable fixture stored the credential through the existing encrypted service, never the owner's database. Evidence includes no key, request headers or credential bodies. This role batch does not turn the original default-budget folded nonpasses below into passes, and does not close original 0527 or the owner-parked 0533 program.

```sh
env -u GEMINI_PROBE_KEY GEMINI_ROLE_RESULTS=/tmp/h-gemini-roles-final-normalized.jsonl pnpm exec node scripts/probes/rpg-structured-live/gemini-roles.ts
```

## Funded Gemini consumer acceptance

The funded consumer cohorts ran through production composition at D8 tip `384d8ed9e6`, with H accounting edits declared by `dirtyProduct: true`. They are retained in `results.jsonl`: `nkybpjfp` has the native matrix, `fvzxats7` has the completed Custom matrix, and `n40e9s9z` has the approved fresh Pro structured prerequisites and resync. No provider calls ran to produce this report.

| cell | folded turns / checks | cheap turns / checks | resync checks | actual state vehicle |
| - | - | - | - | - |
| `gemini-3.8-flash` | 7/8 · 15/16 | 8/8 · 16/16 | 5/5 | native tools (`mode: ANY`) |
| `gemini-3.1-pro-preview` | 7/8 · 14/16 | 8/8 · 16/16 | 5/5 | native tools (`mode: ANY`) |
| `gemini-3.8-flash-structured` | not called | 8/8 · 16/16 | 5/5 | native `generationConfig` union |
| `gemini-3.1-pro-preview-structured` | not called | 8/8 · 16/16 | 5/5 | native `generationConfig` union |
| `custom-gemini-3.8-flash-compat` | 8/8 · 16/16 | 8/8 · 16/16 | 5/5 | compatibility `response_format.json_schema` union |
| `custom-gemini-3.1-pro-preview-compat` | 8/8 · 16/16 | 8/8 · 16/16 | 5/5 | compatibility `response_format.json_schema` union |

Native folded consumers actually co-emitted state calls on the character turn. Flash missed the requested quest once; Resolve and Alarm were both applied. Pro's first folded send reached `MAX_TOKENS` at the configured 2048 output cap and was refused; it is not a passing send. Their folded cells remain nonpassing. Custom folded consumers actually used the reported `local-engine-fold-guard` post-commit structured path; that is not native co-emission proof.

The folded mode and output cap are real admitted defaults, not probe-only settings: `rpg/config.ts` defaults `extractionMode` to `folded`, and `preset/index.ts` defaults output to 2048. This probe does not override output length. The Pro refusal names the cap and preserves the previous reply. Recovery requires an actual terminal call with no prose; this failed row had no calls, so the recovery condition did not apply. Its row does not retain character response token metadata; exact thoughts-versus-visible counts cannot be reconstructed from it.

Flash `nkybpjfp / folded / t5-letter` retained the exact player request to deliver the sealed letter to the old mill. The observed calls were `set_tracker` for Alarm 60 and `update_party` for Resolve determined, both `applied`. No quest call appeared and no call was dropped or malformed. The quest panel remained empty. This is an observed generative omission, not evidence that the serializer lost a returned quest. Supported co-emission does not guarantee every model choice; it is not a passing quest control.

The stamina oracle now uses the fixture's actual ceiling of 10 for an unset capped meter. The retained `null → 7` update after delta −3 is correct. Ordinary `fixtureControls` metadata identifies the verified funded cohorts. Historical null-start rows without verified controls retain their stored verdicts and are excluded from current acceptance; their raw rows are unchanged. A stored send error or `resync.ok: false` fails every check.

The original native process ended with terminal 143 after completed rows; Pro structured resync was unsettled. The compatibility process completed both Custom cells and was stopped during three extra Pro setup turns; those partial rows remain evidence. The approved `n40e9s9z` run played the necessary eight cheap prerequisites once, then completed the real Pro structured resync. Its HTTP 200 `no_changes` result was `ok: true`, `rebuilt: false`, and retained all five panel invariants. Its raw usage reports prompt 6181, candidates 34, thoughts 527, total 6742, and standard service tier.

These cells establish the named tool and structured paths, not a blanket Gemini verdict. Default native folded cells remain nonpassing; complete normalized accounting remains under audit. The original item 0527 is not closed by this table.

```sh
env -u GEMINI_PROBE_KEY RPG_LIVE_RESULTS=/tmp/h-inference-rpg-funded.jsonl LOG_LEVEL=warn pnpm exec node scripts/probes/rpg-structured-live/run.ts gemini-3.8-flash gemini-3.1-pro-preview gemini-3.8-flash-structured gemini-3.1-pro-preview-structured
env -u GEMINI_PROBE_KEY RPG_LIVE_RESULTS=/tmp/h-inference-rpg-funded-compat.jsonl LOG_LEVEL=warn pnpm exec node scripts/probes/rpg-structured-live/run.ts custom-gemini-3.8-flash-compat custom-gemini-3.1-pro-preview-compat gemini-3.1-pro-preview-structured@resync
env -u GEMINI_PROBE_KEY RPG_LIVE_RESULTS=/tmp/h-inference-rpg-pro-resync-approved.jsonl LOG_LEVEL=warn pnpm exec node scripts/probes/rpg-structured-live/run.ts gemini-3.1-pro-preview-structured@resync
pnpm exec node scripts/probes/rpg-structured-live/run.ts report
```

## Explicit roomy-budget Pro folded diagnostic

Run `7pdsrb6q` on `d9ff5c6704` (`dirtyProduct: true`) used the same eight-turn scenario, folded extraction, default reasoning and `AUTO`, with the separately approved explicit output cap **16384** (advertised maximum 65536). It passed **8/8 turns and 16/16 checks**, with no send errors or transport retries. All 11 metadata/turn rows are retained in `results.jsonl`.

This was **16 observed HTTP 200 requests**, all finishing `STOP`: each first request returned signed terminal function calls without narrative, then the existing bounded tool-less recovery produced prose. It proves the production folded consumer plus recovery, not single-request prose/tool co-emission or ordinary registry function-response continuation. Every captured request used `generationConfig.maxOutputTokens: 16384`, without an explicit `thinkingConfig`; first requests declared all seven tools with `AUTO`, and recovery requests declared no tools. The served version was `gemini-3.1-pro-preview` throughout.

At `t5-letter`, the first response reported 341 candidate + 1710 thought tokens (2051 output); recovery reported 951 candidate + 1746 thought tokens (2697 output). Both exceed the original 2048 cap. This is direct evidence of the budget constraint, not a reconstructed count for the original failed request. The original admitted-default 2048 nonpass remains above; no default reserve, reasoning policy or history-fit behavior changed.

The process and recorded PIDs completed, but terminal session `51972` was unavailable after context recovery, so its exit code is **unavailable**, not claimed zero. The completed per-turn artifacts establish the stated checks. No provider request was repeated to recover a terminal receipt. Paid first/recovery accounting retention remains a required source correction; this diagnostic alone does not close item 0527.

```sh
env -u GEMINI_PROBE_KEY RPG_LIVE_RESULTS=/tmp/h-inference-rpg-pro-folded-16k.jsonl LOG_LEVEL=warn pnpm exec node scripts/probes/rpg-structured-live/run.ts gemini-3.1-pro-preview-folded-16k
```

## Historical quota-blocked Gemini attempt

Run `d0mxzn5b` used production composition on `7bad0df1cc`, with `dirtyProduct: false`. The new Custom cell uses Google's documented compatibility endpoint and the existing `thinkingOff: "none"` declaration. It requests the structured state vehicle; native retains its existing `auto` vehicle. All prior JSONL rows remain.

| cell | consumer | successful sends | turns pass | checks | observed resync vehicle | blocker |
| - | - | - | - | - | - | - |
| `gemini-3.8-flash` | folded | 0/8 | 0/8 | 0/16 | - | HTTP 429 quota and HTTP 503 high demand |
| `gemini-3.8-flash` | cheap | 0/8 | 0/8 | 0/16 | - | HTTP 429 daily quota |
| `gemini-3.8-flash` | resync | - | 0/1 | 0/5 | native tools, `mode: ANY` | HTTP 429 daily quota |
| `custom-gemini-3.8-flash-compat` | folded | 0/8 | 0/8 | 0/16 | - | provider refusal |
| `custom-gemini-3.8-flash-compat` | cheap | 0/8 | 0/8 | 0/16 | - | provider refusal |
| `custom-gemini-3.8-flash-compat` | resync | - | 0/1 | 0/5 | `response_format.json_schema`, union | HTTP 429 daily quota |

The completed command exited 0; that is not provider acceptance. No send completed and neither resync rebuilt state. The report now refuses passes from empty-panel invariants after a recorded send failure or `resync.ok: false`. Re-reading the same failed rows changed each send consumer from 1/8 to 0/8; successful stored consumers retain their checks.

Native `sendError` preserves the provider's quota refusal: `generate_content_free_tier_requests`, daily limit 20, model `gemini-3.8-flash`, "Please retry in 9h57m9.100872315s." Resync records status 429. Custom errors reach production as status-bearing `ProviderError` with empty text (`packages/inference/src/backends/kit/error-classify.ts:316`); this probe's reply digest does not retain their raw error bodies. The Smart probe's same-endpoint raw replies separately preserve 503 and 429 refusals. Neither is counted as a pass.

```sh
LOG_LEVEL=info RPG_LIVE_RESULTS=/tmp/h-inference-rpg-gemini.jsonl pnpm exec node scripts/probes/rpg-structured-live/run.ts gemini-3.8-flash custom-gemini-3.8-flash-compat
RPG_LIVE_RESULTS=/tmp/h-inference-rpg-gemini.jsonl pnpm exec node scripts/probes/rpg-structured-live/run.ts report
```

The per-run file's 40 rows remain in `results.jsonl`. This quota-blocked cohort is superseded for consumer acceptance by the funded cohorts above, not reclassified as passing.

## Hard-window conditional evidence

[`history-fit-counts.json`](history-fit-counts.json) records CPU token counts with the installed Qwen3.8-27B tokenizer and the owner's stored serving template. No engine was started, woken or changed; no assets were downloaded. These are template/tokenizer counts, not live server evaluation or an owner-profile import census.

The source manifest is the existing captured production RPG requests under `scripts/probes/prose-with-tools/results/2026-10-03/app-requests/{vllm,llama-cpp}/turn-01.json` through `turn-10.json`, the ST-format `ashen-spire.jsonl` seed, and the local-window probe's scripted prose. The numbered variant adds a `Note <number>.<number>:` prefix to each prose line and is explicitly synthetic. Each sample goes through current `fitHistoryToWindow` at 4096, with its original output reserve, before the CPU tokenizer renders retained messages and tools.

| sample | retained rows | prompt tokens | output reserve | total | inside 4096 |
| - | - | - | - | - | - |
| ST-format repository import seed | 10 | 162 | 2048 | 2210 | yes |
| scripted prose stress | 60 | 2578 | 16 | 2594 | yes |
| numbered prose stress | 47 | 2747 | 16 | 2763 | yes |
| captured vLLM RPG first turn, with tools | 3 | 3761 | 2048 | 5809 | no |
| captured vLLM RPG final turn, with tools | 21 | 4425 | 2048 | 6473 | no |

The captured requests were configured for 16384, not 4096: `capture-app-requests.ts:115` advertises `max_model_len: 16384`, and the recorded server launches use 16384. All captured samples fit their configured window. The table's 4096 is a counterfactual small-window test, not a failed real session.

At counterfactual 4096 with the original 2048 reply reserve and folded tool set, every captured sample overflows. Their text-only totals fit. The first request's tools add 3157 tokens; its system, tools, current user and unchanged reserve alone cannot fit. Counting history passages alone cannot repair that configuration. This does not establish that every 4096 RPG configuration is unsupported. Default local capability rows guard folded terminal tools and use the post-commit state round instead; that round is not certified by these samples.

The artifact also retains stock-template counts, which differ from the stored serving template: the first vLLM prompt is 3820 with stock versus 3761 with the stored template. These CPU counts establish the algebra, not current live serving behavior. No supported local tokenize endpoint was listening on the probe ports; no live endpoint acceptance ran.

`packages/server/src/domain/chat/engine/pipeline.ts:729` budgets only system text before history fitting; tools attach at `pipeline.ts:810`. `history-budget.ts:193` deliberately retains the newest turn. The working-set cap includes system, history and reserved output, not history alone. A complete fix needs the full-request scaffold budget and an explicit outcome when mandatory input plus reserve cannot fit. This investigation changes neither output reserve nor tool delivery, and adds no larger safety factor. The representative launch condition is complete for this captured 16384 cohort and the stated synthetic controls. The original real-token history-fit item remains open: its digit-heavy ledger undercount and full-request scaffold gap remain, and its ledger-row endpoint acceptance is not established. No exact-budget guarantee is claimed.

## Historical non-Gemini matrix

The historical run used branch `wt/agent-ac2270bb4049dd28e`. Its tagged rows carry `tree.head` and
`tree.dirtyProduct`. Two trees were measured:

- **Baseline, `28ff5ad5fc`** (verifier round 6 CONFIRMED): the whole matrix.
- **After the fixes, `632f51c8ba`**: `af742f57af` (both delivery reasons show on the panel) and `791d5a7ba0` (several
  `update_scene` calls in one round merge field by field), merged with main. Every structured cell, the
  structured-unavailable cell and all swipe cells reran here.

No verdict in the historical tables below reads a row with `dirtyProduct: true`; the one such historical run (`vbzmd99e`, an early structured-unavailable
pass against another agent's uncommitted edits) is superseded. [`README.md`](README.md) describes how the probe drives
the production path. `pnpm exec node scripts/probes/rpg-structured-live/run.ts report` reads each cell's latest rows, including the funded cohorts above. The historical tables below retain their original cohort rather than claiming to be that newest report.

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

Gemini's current bounded consumer verdict is recorded above; this historical matrix did not test it. The empty-round retry (`structured_fallback`) never fired live: every
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
| gemini-3.8-flash | all | - | not called in this historical matrix; see funded cohort | - | - | - | - | - | - |

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
| N variant A (rope) | cheap tool round | wrote | inventory: \[] → \["Coil of Sturdy Hemp Rope"] |
| N variant B (dagger), swiped | cheap tool round | wrote | inventory: \["Coil of Sturdy Hemp Rope"] → \["Silver Dagger"] |
| N back to variant A | - | - | inventory: \["Silver Dagger"] → \["Coil of Sturdy Hemp Rope"] |
| N+1 variant C (stables) on A | cheap tool round | wrote | location: "Copper Lantern inn, Ashford" → "Stables behind the Copper Lantern inn, Ashford"<br>clock: "{"day":1,"hour":18,"minute":0}" → "{"day":1,"hour":0,"minute":0}" |
| N+1 variant D (chapel), regenerated | cheap tool round | wrote | location: "Stables behind the Copper Lantern inn, Ashford" → "St. Elowen's Chapel, Ashford"<br>present: \["Marta"] → \[] |
| N+1 back to variant C | - | - | location: "St. Elowen's Chapel, Ashford" → "Stables behind the Copper Lantern inn, Ashford"<br>present: \[] → \["Marta"] |

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
| N variant A (rope) | structured state round | wrote | inventory: \[] → \["Coil of Rope"] |
| N variant B (dagger), swiped | structured state round | wrote | inventory: \["Coil of Rope"] → \["Silver Dagger"] |
| N back to variant A | - | - | inventory: \["Silver Dagger"] → \["Coil of Rope"] |
| N+1 variant C (stables) on A | structured state round | wrote | location: "Copper Lantern inn in Ashford" → "Stables behind the Copper Lantern inn"<br>clock: "{"day":1,"hour":18,"minute":0}" → "{"day":1,"hour":0,"minute":0}" |
| N+1 variant D (chapel), regenerated | structured state round | wrote | location: "Stables behind the Copper Lantern inn" → "Copper Lantern inn in Ashford"<br>inventory: \["Coil of Rope"] → \[] |
| N+1 back to variant C | - | - | location: "Copper Lantern inn in Ashford" → "Stables behind the Copper Lantern inn"<br>inventory: \[] → \["Coil of Rope"] |

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
| N variant A (rope) | structured state round | wrote | inventory: \["Leather satchel"] → \["Leather satchel","Coil of Hemp Rope"]<br>resolve: "steady" → "settled" |
| N variant B (dagger), swiped | structured state round | wrote | inventory: \["Leather satchel","Coil of Hemp Rope"] → \["Leather satchel","Silver Dagger"]<br>resolve: "settled" → "steady" |
| N back to variant A | - | - | inventory: \["Leather satchel","Silver Dagger"] → \["Leather satchel","Coil of Hemp Rope"]<br>resolve: "steady" → "settled" |
| N+1 variant C (stables) on A | structured state round | wrote | clock: "{"day":1,"hour":18,"minute":0}" → "{"day":1,"hour":0,"minute":0}"<br>resolve: "settled" → "contemplative" |
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
| N variant A (rope) | cheap tool round | wrote | inventory: \[] → \["Coil of rope"] |
| N variant B (dagger), swiped | cheap tool round | wrote | inventory: \["Coil of rope"] → \["Silver dagger"] |
| N back to variant A | - | - | inventory: \["Silver dagger"] → \["Coil of rope"] |
| N+1 variant C (stables) on A | cheap tool round | wrote | location: "The Copper Lantern inn, Ashford — common room" → "Stables behind the Copper Lantern, Ashford"<br>clock: "{"day":1,"hour":18,"minute":0}" → "{"day":1,"hour":0,"minute":0}"<br>present: \["Marta"] → \[]<br>resolve: null → "contemplative" |
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
| N variant A (rope) | structured state round | wrote | inventory: \[] → \["Coil of rope"]<br>resolve: null → "steady" |
| N variant B (dagger), swiped | structured state round | wrote | inventory: \["Coil of rope"] → \["Silver dagger"]<br>resolve: "steady" → null |
| N back to variant A | - | - | inventory: \["Silver dagger"] → \["Coil of rope"]<br>resolve: null → "steady" |
| N+1 variant C (stables) on A | structured state round + structured inventory audit | wrote | location: "The Copper Lantern inn, Ashford" → "Stables behind the Copper Lantern inn, Ashford"<br>clock: "{"day":1,"hour":18,"minute":0}" → "{"day":1,"hour":0,"minute":0}"<br>present: \["Marta"] → \[] |
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
| N variant A (rope) | cheap tool round | wrote | inventory: \[] → \["Coil of rope"] |
| N variant B (dagger), swiped | cheap tool round | wrote | inventory: \["Coil of rope"] → \["Silver dagger"] |
| N back to variant A | - | - | inventory: \["Silver dagger"] → \["Coil of rope"] |
| N+1 variant C (stables) on A | cheap tool round + cheap inventory audit | wrote | location: "Copper Lantern inn, Ashford" → "stables behind the Copper Lantern inn, Ashford"<br>clock: "{"day":1,"hour":18,"minute":0}" → "{"day":1,"hour":0,"minute":0}"<br>present: \["Marta"] → \[] |
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
