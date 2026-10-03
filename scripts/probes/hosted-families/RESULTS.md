# Family sweep: turn structure and sampler handling (measured 2026-10-03)

Script: `probe.py` (collect) + `report.py` (this file). Raw request/response per case in `raw/<surface>/<model>/<case>[.stream].json`
(OpenRouter `.stream.json` holds the SSE incl. the `debug.echo_upstream_body` chunk). Row-level data: `results.jsonl`.
Rerun: `python3 probe.py [surface...]` (FORCE=1 to redo), then `python3 report.py`.
The raw request/response files (8 MB) are not in git; a fresh run of `probe.py` regenerates them.

Method notes
- Each request max_tokens/max_completion_tokens=300; if the reply was empty at 300 (reasoning burn) it was retried once at 2500 (flagged in results.jsonl `note`).
- OpenAI direct uses `max_completion_tokens` (the reasoning families reject `max_tokens`).
- 429/503 retried 3x (3s/8s/20s); still failing = UNAVAILABLE.
- Verdicts are regex heuristics: FRENCH = reply contains a French goodbye word; prefill CONTINUES = reply starts at F (or E F), RESTARTS = starts A B C; c3 SAW_BOTH = reply names "pelican" (the first user turn survived), LOST_FIRST = it did not.
- Sampler cells on DIRECT APIs: 200 means accepted OR silently ignored; the response cannot distinguish. Only OpenRouter's echoed upstream body shows passed vs dropped.
- Gemini native has no `system` role in `contents`: system lead goes in `systemInstruction`; mid-history/tail system turns are sent as `role:"system"` in `contents` (the thing under test). Native samplers go in `generationConfig` as topK/minP/repetitionPenalty/topA.
- Cases: c1 mid-history system, c2 trailing system (no trailing user), c3 user,user, c4 assistant,assistant, c5 prefill ("A B C D E" assistant tail), samplers (s_all = all four, then each alone).
## Key findings (hand-written from the tables below; the per-family summaries are generated)

OpenAI direct (chat completions, 27 models): every model accepts and obeys a mid-history system turn, a trailing system turn, user,user and assistant,assistant (adjacent roles never rejected, first user turn never lost). Samplers: top_k, min_p, repetition_penalty, top_a each 400 `Unknown parameter` on every model, individually and together. Prefill is not a feature: a final assistant turn is just history, the model restarts or continues nondeterministically (gpt-5.1/5.2, gpt-4o-mini, gpt-6-sol continued in this run; others restarted; gpt-4o differs from direct to OpenRouter) so treat `assistantPrefill` as unsupported/unreliable for the whole vendor. `gpt-5-chat-latest` is retired (404). Reasoning models need `max_completion_tokens`.

Gemini OpenAI-compat: top_k, min_p, repetition_penalty, top_a all 400 `Unknown name` (even top_k). Mid-history system accepted and obeyed on all reachable 3.x/gemma models (the shim lifts it). Tail system and prefill (conversation ending on a model turn) are PER-MODEL: gemini-3-flash-preview, 3.1-flash-lite, 3.5-flash and gemma-4 accept (prefill continues); 3.5-flash-lite, 3.6-flash, 3.7-flash, 3.8-flash 400 `Requests ending with a model turn are not supported.` Adjacent roles OK everywhere reachable. gemini-2.5-* are 404 for this key; gemini-3.1-pro-preview returned 429 quota on every request (unavailable, not measured).

Gemini native generateContent: topK accepted; minP/repetitionPenalty/topA 400 `Unknown name` (each alone too). A `role:"system"` turn inside `contents` is accepted and obeyed on 3-flash-preview/3.1-flash-lite/3.5-flash/gemma-4 but 400 `Role 'system' is not supported` on 3.5-flash-lite, 3.6, 3.7, 3.8-flash (per-model, tracks the same split as the compat tail/prefill 400). Same newer models refuse a trailing model turn (prefill); the older ones continue. Adjacent user,user / model,model accepted.

OpenRouter (stream+echo_upstream_body, raw in raw/openrouter/*/*.stream.json):
- OpenAI proprietary models (gpt-5*, gpt-6*, gpt-4.1*, o3, o4-mini, o3-mini): converted to the RESPONSES API (`input`, `max_output_tokens`); mid/tail system kept as `system` items in place; prefill passed as a trailing assistant `output_text` item; ALL four samplers dropped. gpt-4o, gpt-4o-mini and gpt-oss use chat completions (messages pass untouched). gpt-oss-120b passes top_k/min_p/top_a upstream and drops repetition_penalty. Prefill outcomes follow the model, not OpenRouter.
- Google (gemini-2.5 through 3.8): mid-history and tail system HOISTED into `systemInstruction`; all four samplers dropped (top_k too). Prefill passed through as a trailing model turn: continues on 2.5, 3-flash, 3.1-*, 3.5-flash; 400 `Requests ending with a model turn` on 3.5-flash-lite, 3.6, 3.7, 3.8 (and the hoisted tail-system case ends on a model turn, so it 400s on the same four). gemma-4-31b-it: messages passed through, top_k/min_p/repetition_penalty passed, top_a dropped.
- Anthropic: system turns never stay in `messages`. Old gen (sonnet-4/4.5, opus-4.1/4.5, haiku-4.5, and opus/sonnet 4.6, 4.7 for mid-history) hoists to the `system` field, so a mid-history "answer in French" instruction is not always obeyed (haiku-4.5 and sonnet-4.5 ignored it). Newer (opus-4.8, opus-5, opus-5.5, sonnet-5, sonnet-5.5, fable-5, fable-5.1) MERGE the mid-history system text into the neighbouring user turn and obey. Trailing system with no user: 400 on sonnet-4.6, opus-4.6, opus-4.7 (conversation ends on assistant => prefill refusal). Prefill: continues on sonnet-4/4.5, opus-4.1/4.5, haiku-4.5; refused 400 `This model does not support assistant message prefill` on sonnet-4.6, opus-4.6+, sonnet-5/5.5, fable-5/5.1. Samplers: top_k passed on sonnet-4/4.5, opus-4.1/4.5, haiku-4.5 and DROPPED on 4.6+ and 5.x; min_p, repetition_penalty, top_a always dropped.
- Adjacent user,user and assistant,assistant: 200 everywhere reachable on every surface (roleHandlingFloor: none needed for any tested family; Anthropic merges adjacent roles inside OpenRouter).

Families where models DISAGREE (fact must be per-model): Gemini 3.x (trailing-model-turn/prefill and native system-in-contents split lite/3.6+ vs earlier); Anthropic via OpenRouter (prefill, tail system, top_k, hoist-vs-merge split at 4.6/4.8); OpenAI prefill is nondeterministic per call, not a fact; gemma-4 26b vs 31b flaked earlier with 500s and agreed after retries.

Unavailable: gemini-3.1-pro-preview (quota 429 on direct compat+native; OpenRouter route measured), gemini-2.5-* direct (404 no longer available to new users), gemini-3.7-flash native c3 (429 after retries), gpt-5-chat-latest (404 deprecated). Stray EMPTY replies on OpenRouter sampler cases (gpt-5-nano, o3-mini) are reasoning burn at 300 tokens (status 200, samplers cases are not retried at 2500).


## OpenAI direct


#### Turn-structure cases (status + verdict)

| model | c1_mid_system | c2_tail_system | c3_user_user | c4_asst_asst | c5_prefill |
|---|---|---|---|---|---|
| chat-latest | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| gpt-4.1 | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| gpt-4.1-mini | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| gpt-4.1-nano | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| gpt-4o | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| gpt-4o-mini | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 CONTINUES |
| gpt-5 | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| gpt-5-chat-latest | 404 | 404 | 404 | 404 | 404 |
| gpt-5-mini | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| gpt-5-nano | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| gpt-5.1 | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 CONTINUES |
| gpt-5.2 | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 CONTINUES |
| gpt-5.4 | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| gpt-5.4-mini | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| gpt-5.4-nano | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| gpt-5.5 | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| gpt-5.6-luna | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| gpt-5.6-sol | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| gpt-5.6-terra | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| gpt-6-astra | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| gpt-6-luna | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| gpt-6-sol | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 CONTINUES |
| gpt-6.1-sol | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| o1 | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| o3 | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| o3-mini | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| o4-mini | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |

#### Samplers (status; 200 = accepted or silently ignored)

| model | s_all | s_top_k | s_min_p | s_repetition_penalty | s_top_a |
|---|---|---|---|---|---|
| chat-latest | 400 | 400 | 400 | 400 | 400 |
| gpt-4.1 | 400 | 400 | 400 | 400 | 400 |
| gpt-4.1-mini | 400 | 400 | 400 | 400 | 400 |
| gpt-4.1-nano | 400 | 400 | 400 | 400 | 400 |
| gpt-4o | 400 | 400 | 400 | 400 | 400 |
| gpt-4o-mini | 400 | 400 | 400 | 400 | 400 |
| gpt-5 | 400 | 400 | 400 | 400 | 400 |
| gpt-5-chat-latest | 404 | 404 | 404 | 404 | 404 |
| gpt-5-mini | 400 | 400 | 400 | 400 | 400 |
| gpt-5-nano | 400 | 400 | 400 | 400 | 400 |
| gpt-5.1 | 400 | 400 | 400 | 400 | 400 |
| gpt-5.2 | 400 | 400 | 400 | 400 | 400 |
| gpt-5.4 | 400 | 400 | 400 | 400 | 400 |
| gpt-5.4-mini | 400 | 400 | 400 | 400 | 400 |
| gpt-5.4-nano | 400 | 400 | 400 | 400 | 400 |
| gpt-5.5 | 400 | 400 | 400 | 400 | 400 |
| gpt-5.6-luna | 400 | 400 | 400 | 400 | 400 |
| gpt-5.6-sol | 400 | 400 | 400 | 400 | 400 |
| gpt-5.6-terra | 400 | 400 | 400 | 400 | 400 |
| gpt-6-astra | 400 | 400 | 400 | 400 | 400 |
| gpt-6-luna | 400 | 400 | 400 | 400 | 400 |
| gpt-6-sol | 400 | 400 | 400 | 400 | 400 |
| gpt-6.1-sol | 400 | 400 | 400 | 400 | 400 |
| o1 | 400 | 400 | 400 | 400 | 400 |
| o3 | 400 | 400 | 400 | 400 | 400 |
| o3-mini | 400 | 400 | 400 | 400 | 400 |
| o4-mini | 400 | 400 | 400 | 400 | 400 |

#### Distinct non-sampler error messages (status, message -> case: models)

- 404 `The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations` -> c1_mid_system: gpt-5-chat-latest; c2_tail_system: gpt-5-chat-latest; c3_user_user: gpt-5-chat-latest; c4_asst_asst: gpt-5-chat-latest; c5_prefill: gpt-5-chat-latest

### Summary per family

**chat-latest** (chat-latest)
- midConversationSystem: accepted/obeyed
- tailSystem: accepted/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: restarts
- top_k: rejected(400)
- min_p: rejected(400)
- repetition_penalty: rejected(400)
- top_a: rejected(400)

**gpt-4.1** (gpt-4.1, gpt-4.1-mini, gpt-4.1-nano)
- midConversationSystem: accepted/obeyed
- tailSystem: accepted/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: restarts
- top_k: rejected(400)
- min_p: rejected(400)
- repetition_penalty: rejected(400)
- top_a: rejected(400)

**gpt-4o** (gpt-4o, gpt-4o-mini)
- midConversationSystem: accepted/obeyed
- tailSystem: accepted/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: **DISAGREE** restarts [gpt-4o]; continues [gpt-4o-mini]
- top_k: rejected(400)
- min_p: rejected(400)
- repetition_penalty: rejected(400)
- top_a: rejected(400)

**gpt-5** (gpt-5, gpt-5-chat-latest, gpt-5-mini, gpt-5-nano)
- midConversationSystem: **DISAGREE** accepted/obeyed [gpt-5, gpt-5-mini, gpt-5-nano]; unavailable(404) [gpt-5-chat-latest]
- tailSystem: **DISAGREE** accepted/obeyed [gpt-5, gpt-5-mini, gpt-5-nano]; unavailable(404) [gpt-5-chat-latest]
- adjUser: **DISAGREE** ok/saw_both [gpt-5, gpt-5-mini, gpt-5-nano]; unavailable(404) [gpt-5-chat-latest]
- adjAssistant: **DISAGREE** ok/replied [gpt-5, gpt-5-mini, gpt-5-nano]; unavailable(404) [gpt-5-chat-latest]
- assistantPrefill: **DISAGREE** restarts [gpt-5, gpt-5-mini, gpt-5-nano]; unavailable(404) [gpt-5-chat-latest]
- top_k: **DISAGREE** rejected(400) [gpt-5, gpt-5-mini, gpt-5-nano]; unavailable(404) [gpt-5-chat-latest]
- min_p: **DISAGREE** rejected(400) [gpt-5, gpt-5-mini, gpt-5-nano]; unavailable(404) [gpt-5-chat-latest]
- repetition_penalty: **DISAGREE** rejected(400) [gpt-5, gpt-5-mini, gpt-5-nano]; unavailable(404) [gpt-5-chat-latest]
- top_a: **DISAGREE** rejected(400) [gpt-5, gpt-5-mini, gpt-5-nano]; unavailable(404) [gpt-5-chat-latest]

**gpt-5.1** (gpt-5.1)
- midConversationSystem: accepted/obeyed
- tailSystem: accepted/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: continues
- top_k: rejected(400)
- min_p: rejected(400)
- repetition_penalty: rejected(400)
- top_a: rejected(400)

**gpt-5.2** (gpt-5.2)
- midConversationSystem: accepted/obeyed
- tailSystem: accepted/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: continues
- top_k: rejected(400)
- min_p: rejected(400)
- repetition_penalty: rejected(400)
- top_a: rejected(400)

**gpt-5.4** (gpt-5.4, gpt-5.4-mini, gpt-5.4-nano)
- midConversationSystem: accepted/obeyed
- tailSystem: accepted/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: restarts
- top_k: rejected(400)
- min_p: rejected(400)
- repetition_penalty: rejected(400)
- top_a: rejected(400)

**gpt-5.5** (gpt-5.5)
- midConversationSystem: accepted/obeyed
- tailSystem: accepted/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: restarts
- top_k: rejected(400)
- min_p: rejected(400)
- repetition_penalty: rejected(400)
- top_a: rejected(400)

**gpt-5.6** (gpt-5.6-luna, gpt-5.6-sol, gpt-5.6-terra)
- midConversationSystem: accepted/obeyed
- tailSystem: accepted/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: restarts
- top_k: rejected(400)
- min_p: rejected(400)
- repetition_penalty: rejected(400)
- top_a: rejected(400)

**gpt-6** (gpt-6-astra, gpt-6-luna, gpt-6-sol)
- midConversationSystem: accepted/obeyed
- tailSystem: accepted/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: **DISAGREE** restarts [gpt-6-astra, gpt-6-luna]; continues [gpt-6-sol]
- top_k: rejected(400)
- min_p: rejected(400)
- repetition_penalty: rejected(400)
- top_a: rejected(400)

**gpt-6.1** (gpt-6.1-sol)
- midConversationSystem: accepted/obeyed
- tailSystem: accepted/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: restarts
- top_k: rejected(400)
- min_p: rejected(400)
- repetition_penalty: rejected(400)
- top_a: rejected(400)

**o-series** (o1, o3, o3-mini, o4-mini)
- midConversationSystem: accepted/obeyed
- tailSystem: accepted/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: restarts
- top_k: rejected(400)
- min_p: rejected(400)
- repetition_penalty: rejected(400)
- top_a: rejected(400)

## Gemini OpenAI-compat


#### Turn-structure cases (status + verdict)

| model | c1_mid_system | c2_tail_system | c3_user_user | c4_asst_asst | c5_prefill |
|---|---|---|---|---|---|
| gemini-2.5-flash | 404 | 404 | 404 | 404 | 404 |
| gemini-2.5-flash-lite | 404 | 404 | 404 | 404 | 404 |
| gemini-2.5-pro | 404 | 404 | 404 | 404 | 404 |
| gemini-3-flash-preview | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 CONTINUES |
| gemini-3.1-flash-lite | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 CONTINUES |
| gemini-3.1-pro-preview | 429 | 429 | 429 | 429 | 429 |
| gemini-3.5-flash | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 CONTINUES |
| gemini-3.5-flash-lite | 200 FRENCH | 400 | 200 SAW_BOTH | 200 REPLIED | 400 |
| gemini-3.6-flash | 200 FRENCH | 400 | 200 SAW_BOTH | 200 REPLIED | 400 |
| gemini-3.7-flash | 200 FRENCH | 400 | 200 SAW_BOTH | 200 REPLIED | 400 |
| gemini-3.8-flash | 200 FRENCH | 400 | 200 SAW_BOTH | 200 REPLIED | 400 |
| gemma-4-26b-a4b-it | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 CONTINUES |
| gemma-4-31b-it | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 CONTINUES |

#### Samplers (status; 200 = accepted or silently ignored)

| model | s_all | s_top_k | s_min_p | s_repetition_penalty | s_top_a |
|---|---|---|---|---|---|
| gemini-2.5-flash | 400 | 400 | 400 | 400 | 400 |
| gemini-2.5-flash-lite | 400 | 400 | 400 | 400 | 400 |
| gemini-2.5-pro | 400 | 400 | 400 | 400 | 400 |
| gemini-3-flash-preview | 400 | 400 | 400 | 400 | 400 |
| gemini-3.1-flash-lite | 400 | 400 | 400 | 400 | 400 |
| gemini-3.1-pro-preview | 400 | 400 | 400 | 400 | 400 |
| gemini-3.5-flash | 400 | 400 | 400 | 400 | 400 |
| gemini-3.5-flash-lite | 400 | 400 | 400 | 400 | 400 |
| gemini-3.6-flash | 400 | 400 | 400 | 400 | 400 |
| gemini-3.7-flash | 400 | 400 | 400 | 400 | 400 |
| gemini-3.8-flash | 400 | 400 | 400 | 400 | 400 |
| gemma-4-26b-a4b-it | 400 | 400 | 400 | 400 | 400 |
| gemma-4-31b-it | 400 | 400 | 400 | 400 | 400 |

#### Distinct non-sampler error messages (status, message -> case: models)

- 404 `"This model models/X is no longer available to new users. Please update your code to use models/X for the latest features and improvements. We recommend you to use the In` -> c1_mid_system: gemini-2.5-flash, gemini-2.5-flash-lite, gemini-2.5-pro; c2_tail_system: gemini-2.5-flash, gemini-2.5-flash-lite, gemini-2.5-pro; c3_user_user: gemini-2.5-flash, gemini-2.5-flash-lite, gemini-2.5-pro; c4_asst_asst: gemini-2.5-flash, gemini-2.5-flash-lite, gemini-2.5-pro; c5_prefill: gemini-2.5-flash, gemini-2.5-flash-lite, gemini-2.5-pro
- 400 `"Requests ending with a model turn are not supported.", "status": "INVALID_ARGUMENT" } } ]` -> c2_tail_system: gemini-3.5-flash-lite, gemini-3.6-flash, gemini-3.7-flash, gemini-3.8-flash; c5_prefill: gemini-3.5-flash-lite, gemini-3.6-flash, gemini-3.7-flash, gemini-3.8-flash
- 429 `"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limi` -> c1_mid_system: gemini-3.1-pro-preview; c2_tail_system: gemini-3.1-pro-preview; c3_user_user: gemini-3.1-pro-preview; c4_asst_asst: gemini-3.1-pro-preview; c5_prefill: gemini-3.1-pro-preview

### Summary per family

**gemini-2.5** (gemini-2.5-flash, gemini-2.5-flash-lite, gemini-2.5-pro)
- midConversationSystem: unavailable(404)
- tailSystem: unavailable(404)
- adjUser: unavailable(404)
- adjAssistant: unavailable(404)
- assistantPrefill: unavailable(404)
- top_k: rejected(400)
- min_p: rejected(400)
- repetition_penalty: rejected(400)
- top_a: rejected(400)

**gemini-3** (gemini-3-flash-preview)
- midConversationSystem: accepted/obeyed
- tailSystem: accepted/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: continues
- top_k: rejected(400)
- min_p: rejected(400)
- repetition_penalty: rejected(400)
- top_a: rejected(400)

**gemini-3.x** (gemini-3.1-flash-lite, gemini-3.1-pro-preview, gemini-3.5-flash, gemini-3.5-flash-lite, gemini-3.6-flash, gemini-3.7-flash, gemini-3.8-flash)
- midConversationSystem: **DISAGREE** accepted/obeyed [gemini-3.1-flash-lite, gemini-3.5-flash, gemini-3.5-flash-lite, gemini-3.6-flash, gemini-3.7-flash, gemini-3.8-flash]; unavailable(429) [gemini-3.1-pro-preview]
- tailSystem: **DISAGREE** accepted/obeyed [gemini-3.1-flash-lite, gemini-3.5-flash]; unavailable(429) [gemini-3.1-pro-preview]; rejected(400) [gemini-3.5-flash-lite, gemini-3.6-flash, gemini-3.7-flash, gemini-3.8-flash]
- adjUser: **DISAGREE** ok/saw_both [gemini-3.1-flash-lite, gemini-3.5-flash, gemini-3.5-flash-lite, gemini-3.6-flash, gemini-3.7-flash, gemini-3.8-flash]; unavailable(429) [gemini-3.1-pro-preview]
- adjAssistant: **DISAGREE** ok/replied [gemini-3.1-flash-lite, gemini-3.5-flash, gemini-3.5-flash-lite, gemini-3.6-flash, gemini-3.7-flash, gemini-3.8-flash]; unavailable(429) [gemini-3.1-pro-preview]
- assistantPrefill: **DISAGREE** continues [gemini-3.1-flash-lite, gemini-3.5-flash]; unavailable(429) [gemini-3.1-pro-preview]; refused(400) [gemini-3.5-flash-lite, gemini-3.6-flash, gemini-3.7-flash, gemini-3.8-flash]
- top_k: rejected(400)
- min_p: rejected(400)
- repetition_penalty: rejected(400)
- top_a: rejected(400)

**gemma-4** (gemma-4-26b-a4b-it, gemma-4-31b-it)
- midConversationSystem: accepted/obeyed
- tailSystem: accepted/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: continues
- top_k: rejected(400)
- min_p: rejected(400)
- repetition_penalty: rejected(400)
- top_a: rejected(400)

## Gemini native generateContent


#### Turn-structure cases (status + verdict)

| model | c1_mid_system | c2_tail_system | c3_user_user | c4_asst_asst | c5_prefill |
|---|---|---|---|---|---|
| gemini-2.5-flash | 404 | 404 | 404 | 404 | 404 |
| gemini-2.5-flash-lite | 404 | 404 | 404 | 404 | 404 |
| gemini-2.5-pro | 404 | 404 | 404 | 404 | 404 |
| gemini-3-flash-preview | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 CONTINUES |
| gemini-3.1-flash-lite | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 CONTINUES |
| gemini-3.1-pro-preview | 429 | 429 | 429 | 429 | 429 |
| gemini-3.5-flash | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 CONTINUES |
| gemini-3.5-flash-lite | 400 | 400 | 200 SAW_BOTH | 200 REPLIED | 400 |
| gemini-3.6-flash | 400 | 400 | 200 SAW_BOTH | 200 REPLIED | 400 |
| gemini-3.7-flash | 400 | 400 | 429 | 200 REPLIED | 400 |
| gemini-3.8-flash | 400 | 400 | 200 SAW_BOTH | 200 REPLIED | 400 |
| gemma-4-26b-a4b-it | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 CONTINUES |
| gemma-4-31b-it | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 CONTINUES |

#### Samplers (status; 200 = accepted or silently ignored)

| model | s_all | s_top_k | s_min_p | s_repetition_penalty | s_top_a |
|---|---|---|---|---|---|
| gemini-2.5-flash | 400 | 404 | 400 | 400 | 400 |
| gemini-2.5-flash-lite | 400 | 404 | 400 | 400 | 400 |
| gemini-2.5-pro | 400 | 404 | 400 | 400 | 400 |
| gemini-3-flash-preview | 400 | 200 | 400 | 400 | 400 |
| gemini-3.1-flash-lite | 400 | 200 | 400 | 400 | 400 |
| gemini-3.1-pro-preview | 400 | 429 | 400 | 400 | 400 |
| gemini-3.5-flash | 400 | 200 | 400 | 400 | 400 |
| gemini-3.5-flash-lite | 400 | 200 | 400 | 400 | 400 |
| gemini-3.6-flash | 400 | 200 | 400 | 400 | 400 |
| gemini-3.7-flash | 400 | 200 | 400 | 400 | 400 |
| gemini-3.8-flash | 400 | 200 | 400 | 400 | 400 |
| gemma-4-26b-a4b-it | 400 | 200 | 400 | 400 | 400 |
| gemma-4-31b-it | 400 | 200 | 400 | 400 | 400 |

#### Distinct non-sampler error messages (status, message -> case: models)

- 404 `This model models/X is no longer available to new users. Please update your code to use models/X for the latest features and improvements. We recommend you to use the Int` -> c1_mid_system: gemini-2.5-flash, gemini-2.5-flash-lite, gemini-2.5-pro; c2_tail_system: gemini-2.5-flash, gemini-2.5-flash-lite, gemini-2.5-pro; c3_user_user: gemini-2.5-flash, gemini-2.5-flash-lite, gemini-2.5-pro; c4_asst_asst: gemini-2.5-flash, gemini-2.5-flash-lite, gemini-2.5-pro; c5_prefill: gemini-2.5-flash, gemini-2.5-flash-lite, gemini-2.5-pro
- 400 `Role 'system' is not supported. Please use a valid role: MODEL, USER.` -> c1_mid_system: gemini-3.5-flash-lite, gemini-3.6-flash, gemini-3.7-flash, gemini-3.8-flash; c2_tail_system: gemini-3.5-flash-lite, gemini-3.6-flash, gemini-3.7-flash, gemini-3.8-flash
- 400 `Requests ending with a model turn are not supported.` -> c5_prefill: gemini-3.5-flash-lite, gemini-3.6-flash, gemini-3.7-flash, gemini-3.8-flash
- 429 `You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limit` -> c1_mid_system: gemini-3.1-pro-preview; c2_tail_system: gemini-3.1-pro-preview; c3_user_user: gemini-3.1-pro-preview, gemini-3.7-flash; c4_asst_asst: gemini-3.1-pro-preview; c5_prefill: gemini-3.1-pro-preview

### Summary per family

**gemini-2.5** (gemini-2.5-flash, gemini-2.5-flash-lite, gemini-2.5-pro)
- midConversationSystem: unavailable(404)
- tailSystem: unavailable(404)
- adjUser: unavailable(404)
- adjAssistant: unavailable(404)
- assistantPrefill: unavailable(404)
- top_k: unavailable(404)
- min_p: rejected(400)
- repetition_penalty: rejected(400)
- top_a: rejected(400)

**gemini-3** (gemini-3-flash-preview)
- midConversationSystem: accepted/obeyed
- tailSystem: accepted/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: continues
- top_k: 200(accepted-or-ignored)
- min_p: rejected(400)
- repetition_penalty: rejected(400)
- top_a: rejected(400)

**gemini-3.x** (gemini-3.1-flash-lite, gemini-3.1-pro-preview, gemini-3.5-flash, gemini-3.5-flash-lite, gemini-3.6-flash, gemini-3.7-flash, gemini-3.8-flash)
- midConversationSystem: **DISAGREE** accepted/obeyed [gemini-3.1-flash-lite, gemini-3.5-flash]; unavailable(429) [gemini-3.1-pro-preview]; rejected(400) [gemini-3.5-flash-lite, gemini-3.6-flash, gemini-3.7-flash, gemini-3.8-flash]
- tailSystem: **DISAGREE** accepted/obeyed [gemini-3.1-flash-lite, gemini-3.5-flash]; unavailable(429) [gemini-3.1-pro-preview]; rejected(400) [gemini-3.5-flash-lite, gemini-3.6-flash, gemini-3.7-flash, gemini-3.8-flash]
- adjUser: **DISAGREE** ok/saw_both [gemini-3.1-flash-lite, gemini-3.5-flash, gemini-3.5-flash-lite, gemini-3.6-flash, gemini-3.8-flash]; unavailable(429) [gemini-3.1-pro-preview, gemini-3.7-flash]
- adjAssistant: **DISAGREE** ok/replied [gemini-3.1-flash-lite, gemini-3.5-flash, gemini-3.5-flash-lite, gemini-3.6-flash, gemini-3.7-flash, gemini-3.8-flash]; unavailable(429) [gemini-3.1-pro-preview]
- assistantPrefill: **DISAGREE** continues [gemini-3.1-flash-lite, gemini-3.5-flash]; unavailable(429) [gemini-3.1-pro-preview]; refused(400) [gemini-3.5-flash-lite, gemini-3.6-flash, gemini-3.7-flash, gemini-3.8-flash]
- top_k: **DISAGREE** 200(accepted-or-ignored) [gemini-3.1-flash-lite, gemini-3.5-flash, gemini-3.5-flash-lite, gemini-3.6-flash, gemini-3.7-flash, gemini-3.8-flash]; unavailable(429) [gemini-3.1-pro-preview]
- min_p: rejected(400)
- repetition_penalty: rejected(400)
- top_a: rejected(400)

**gemma-4** (gemma-4-26b-a4b-it, gemma-4-31b-it)
- midConversationSystem: accepted/obeyed
- tailSystem: accepted/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: continues
- top_k: 200(accepted-or-ignored)
- min_p: rejected(400)
- repetition_penalty: rejected(400)
- top_a: rejected(400)

## OpenRouter: openai


#### Turn-structure cases (non-stream status + verdict)

| model | c1_mid_system | c2_tail_system | c3_user_user | c4_asst_asst | c5_prefill |
|---|---|---|---|---|---|
| openai/gpt-4.1 | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| openai/gpt-4.1-mini | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| openai/gpt-4.1-nano | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| openai/gpt-4o | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 CONTINUES |
| openai/gpt-4o-mini | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| openai/gpt-5 | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| openai/gpt-5-mini | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| openai/gpt-5-nano | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| openai/gpt-5.1 | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 CONTINUES |
| openai/gpt-5.2 | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| openai/gpt-5.4 | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 CONTINUES |
| openai/gpt-5.4-mini | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| openai/gpt-5.4-nano | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| openai/gpt-5.5 | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| openai/gpt-5.6-luna | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| openai/gpt-5.6-sol | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| openai/gpt-5.6-terra | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| openai/gpt-6-astra | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| openai/gpt-6-luna | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| openai/gpt-6-sol | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| openai/gpt-6.1-sol | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| openai/gpt-oss-120b | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| openai/o3 | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| openai/o3-mini | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |
| openai/o4-mini | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |

#### Samplers (non-stream status)

| model | s_all | s_top_k | s_min_p | s_repetition_penalty | s_top_a |
|---|---|---|---|---|---|
| openai/gpt-4.1 | 200 | 200 | 200 | 200 | 200 |
| openai/gpt-4.1-mini | 200 | 200 | 200 | 200 | 200 |
| openai/gpt-4.1-nano | 200 | 200 | 200 | 200 | 200 |
| openai/gpt-4o | 200 | 200 | 200 | 200 | 200 |
| openai/gpt-4o-mini | 200 | 200 | 200 | 200 | 200 |
| openai/gpt-5 | 200 | 200 | 200 | 200 | 200 |
| openai/gpt-5-mini | 200 | 200 | 200 | 200 | 200 |
| openai/gpt-5-nano | 200 | 200 | 200 | 200 | 200 |
| openai/gpt-5.1 | 200 | 200 | 200 | 200 | 200 |
| openai/gpt-5.2 | 200 | 200 | 200 | 200 | 200 |
| openai/gpt-5.4 | 200 | 200 | 200 | 200 | 200 |
| openai/gpt-5.4-mini | 200 | 200 | 200 | 200 | 200 |
| openai/gpt-5.4-nano | 200 | 200 | 200 | 200 | 200 |
| openai/gpt-5.5 | 200 | 200 | 200 | 200 | 200 |
| openai/gpt-5.6-luna | 200 | 200 | 200 | 200 | 200 |
| openai/gpt-5.6-sol | 200 | 200 | 200 | 200 | 200 |
| openai/gpt-5.6-terra | 200 | 200 | 200 | 200 | 200 |
| openai/gpt-6-astra | 200 | 200 | 200 | 200 | 200 |
| openai/gpt-6-luna | 200 | 200 | 200 | 200 | 200 |
| openai/gpt-6-sol | 200 | 200 | 200 | 200 | 200 |
| openai/gpt-6.1-sol | 200 | 200 | 200 | 200 | 200 |
| openai/gpt-oss-120b | 200 | 200 | 200 | 200 | 200 |
| openai/o3 | 200 | 200 | 200 | 200 | 200 |
| openai/o3-mini | 200 | 200 | 200 | 200 | 200 |
| openai/o4-mini | 200 | 200 | 200 | 200 | 200 |

#### What OpenRouter sent upstream (from echo_upstream_body; roles U/A/S, system_field = hoisted)

| model | c1_mid_system | c2_tail_system | c3_user_user | c4_asst_asst | c5_prefill | s_all | s_top_k | s_min_p | s_repetition_penalty | s_top_a |
|---|---|---|---|---|---|---|---|---|---|---|
| openai/gpt-4.1 | RESPONSES-API roles=S,U,A,S,U | RESPONSES-API kept in place roles=S,U,A,S | RESPONSES-API roles=S,U,U | RESPONSES-API roles=S,U,A,A,U | RESPONSES-API last=assistant | RESPONSES-API passed=none dropped=top_k,min_p,repetition_penalty,top_a | RESPONSES-API passed=none dropped=top_k | RESPONSES-API passed=none dropped=min_p | RESPONSES-API passed=none dropped=repetition_penalty | RESPONSES-API passed=none dropped=top_a |
| openai/gpt-4.1-mini | RESPONSES-API roles=S,U,A,S,U | RESPONSES-API kept in place roles=S,U,A,S | RESPONSES-API roles=S,U,U | RESPONSES-API roles=S,U,A,A,U | RESPONSES-API last=assistant | RESPONSES-API passed=none dropped=top_k,min_p,repetition_penalty,top_a | RESPONSES-API passed=none dropped=top_k | RESPONSES-API passed=none dropped=min_p | RESPONSES-API passed=none dropped=repetition_penalty | RESPONSES-API passed=none dropped=top_a |
| openai/gpt-4.1-nano | RESPONSES-API roles=S,U,A,S,U | RESPONSES-API kept in place roles=S,U,A,S | RESPONSES-API roles=S,U,U | RESPONSES-API roles=S,U,A,A,U | RESPONSES-API last=assistant | RESPONSES-API passed=none dropped=top_k,min_p,repetition_penalty,top_a | RESPONSES-API passed=none dropped=top_k | RESPONSES-API passed=none dropped=min_p | RESPONSES-API passed=none dropped=repetition_penalty | RESPONSES-API passed=none dropped=top_a |
| openai/gpt-4o | roles=S,U,A,S,U | kept in place roles=S,U,A,S | roles=S,U,U | roles=S,U,A,A,U | last=assistant | passed=none dropped=top_k,min_p,repetition_penalty,top_a | passed=none dropped=top_k | passed=none dropped=min_p | passed=none dropped=repetition_penalty | passed=none dropped=top_a |
| openai/gpt-4o-mini | roles=S,U,A,S,U | kept in place roles=S,U,A,S | roles=S,U,U | roles=S,U,A,A,U | last=assistant | passed=none dropped=top_k,min_p,repetition_penalty,top_a | passed=none dropped=top_k | passed=none dropped=min_p | passed=none dropped=repetition_penalty | passed=none dropped=top_a |
| openai/gpt-5 | RESPONSES-API roles=S,U,A,S,U | RESPONSES-API kept in place roles=S,U,A,S | RESPONSES-API roles=S,U,U | RESPONSES-API roles=S,U,A,A,U | RESPONSES-API last=assistant | RESPONSES-API passed=none dropped=top_k,min_p,repetition_penalty,top_a | RESPONSES-API passed=none dropped=top_k | RESPONSES-API passed=none dropped=min_p | RESPONSES-API passed=none dropped=repetition_penalty | RESPONSES-API passed=none dropped=top_a |
| openai/gpt-5-mini | RESPONSES-API roles=S,U,A,S,U | RESPONSES-API kept in place roles=S,U,A,S | RESPONSES-API roles=S,U,U | RESPONSES-API roles=S,U,A,A,U | RESPONSES-API last=assistant | RESPONSES-API passed=none dropped=top_k,min_p,repetition_penalty,top_a | RESPONSES-API passed=none dropped=top_k | RESPONSES-API passed=none dropped=min_p | RESPONSES-API passed=none dropped=repetition_penalty | RESPONSES-API passed=none dropped=top_a |
| openai/gpt-5-nano | RESPONSES-API roles=S,U,A,S,U | RESPONSES-API kept in place roles=S,U,A,S | RESPONSES-API roles=S,U,U | RESPONSES-API roles=S,U,A,A,U | RESPONSES-API last=assistant | RESPONSES-API passed=none dropped=top_k,min_p,repetition_penalty,top_a | RESPONSES-API passed=none dropped=top_k | RESPONSES-API passed=none dropped=min_p | RESPONSES-API passed=none dropped=repetition_penalty | RESPONSES-API passed=none dropped=top_a |
| openai/gpt-5.1 | RESPONSES-API roles=S,U,A,S,U | RESPONSES-API kept in place roles=S,U,A,S | RESPONSES-API roles=S,U,U | RESPONSES-API roles=S,U,A,A,U | RESPONSES-API last=assistant | RESPONSES-API passed=none dropped=top_k,min_p,repetition_penalty,top_a | RESPONSES-API passed=none dropped=top_k | RESPONSES-API passed=none dropped=min_p | RESPONSES-API passed=none dropped=repetition_penalty | RESPONSES-API passed=none dropped=top_a |
| openai/gpt-5.2 | RESPONSES-API roles=S,U,A,S,U | RESPONSES-API kept in place roles=S,U,A,S | RESPONSES-API roles=S,U,U | RESPONSES-API roles=S,U,A,A,U | RESPONSES-API last=assistant | RESPONSES-API passed=none dropped=top_k,min_p,repetition_penalty,top_a | RESPONSES-API passed=none dropped=top_k | RESPONSES-API passed=none dropped=min_p | RESPONSES-API passed=none dropped=repetition_penalty | RESPONSES-API passed=none dropped=top_a |
| openai/gpt-5.4 | RESPONSES-API roles=S,U,A,S,U | RESPONSES-API kept in place roles=S,U,A,S | RESPONSES-API roles=S,U,U | RESPONSES-API roles=S,U,A,A,U | RESPONSES-API last=assistant | RESPONSES-API passed=none dropped=top_k,min_p,repetition_penalty,top_a | RESPONSES-API passed=none dropped=top_k | RESPONSES-API passed=none dropped=min_p | RESPONSES-API passed=none dropped=repetition_penalty | RESPONSES-API passed=none dropped=top_a |
| openai/gpt-5.4-mini | RESPONSES-API roles=S,U,A,S,U | RESPONSES-API kept in place roles=S,U,A,S | RESPONSES-API roles=S,U,U | RESPONSES-API roles=S,U,A,A,U | RESPONSES-API last=assistant | RESPONSES-API passed=none dropped=top_k,min_p,repetition_penalty,top_a | RESPONSES-API passed=none dropped=top_k | RESPONSES-API passed=none dropped=min_p | RESPONSES-API passed=none dropped=repetition_penalty | RESPONSES-API passed=none dropped=top_a |
| openai/gpt-5.4-nano | RESPONSES-API roles=S,U,A,S,U | RESPONSES-API kept in place roles=S,U,A,S | RESPONSES-API roles=S,U,U | RESPONSES-API roles=S,U,A,A,U | RESPONSES-API last=assistant | RESPONSES-API passed=none dropped=top_k,min_p,repetition_penalty,top_a | RESPONSES-API passed=none dropped=top_k | RESPONSES-API passed=none dropped=min_p | RESPONSES-API passed=none dropped=repetition_penalty | RESPONSES-API passed=none dropped=top_a |
| openai/gpt-5.5 | RESPONSES-API roles=S,U,A,S,U | RESPONSES-API kept in place roles=S,U,A,S | RESPONSES-API roles=S,U,U | RESPONSES-API roles=S,U,A,A,U | RESPONSES-API last=assistant | RESPONSES-API passed=none dropped=top_k,min_p,repetition_penalty,top_a | RESPONSES-API passed=none dropped=top_k | RESPONSES-API passed=none dropped=min_p | RESPONSES-API passed=none dropped=repetition_penalty | RESPONSES-API passed=none dropped=top_a |
| openai/gpt-5.6-luna | RESPONSES-API roles=S,U,A,S,U | RESPONSES-API kept in place roles=S,U,A,S | RESPONSES-API roles=S,U,U | RESPONSES-API roles=S,U,A,A,U | RESPONSES-API last=assistant | RESPONSES-API passed=none dropped=top_k,min_p,repetition_penalty,top_a | RESPONSES-API passed=none dropped=top_k | RESPONSES-API passed=none dropped=min_p | RESPONSES-API passed=none dropped=repetition_penalty | RESPONSES-API passed=none dropped=top_a |
| openai/gpt-5.6-sol | RESPONSES-API roles=S,U,A,S,U | RESPONSES-API kept in place roles=S,U,A,S | RESPONSES-API roles=S,U,U | RESPONSES-API roles=S,U,A,A,U | RESPONSES-API last=assistant | RESPONSES-API passed=none dropped=top_k,min_p,repetition_penalty,top_a | RESPONSES-API passed=none dropped=top_k | RESPONSES-API passed=none dropped=min_p | RESPONSES-API passed=none dropped=repetition_penalty | RESPONSES-API passed=none dropped=top_a |
| openai/gpt-5.6-terra | RESPONSES-API roles=S,U,A,S,U | RESPONSES-API kept in place roles=S,U,A,S | RESPONSES-API roles=S,U,U | RESPONSES-API roles=S,U,A,A,U | RESPONSES-API last=assistant | RESPONSES-API passed=none dropped=top_k,min_p,repetition_penalty,top_a | RESPONSES-API passed=none dropped=top_k | RESPONSES-API passed=none dropped=min_p | RESPONSES-API passed=none dropped=repetition_penalty | RESPONSES-API passed=none dropped=top_a |
| openai/gpt-6-astra | RESPONSES-API roles=S,U,A,S,U | RESPONSES-API kept in place roles=S,U,A,S | RESPONSES-API roles=S,U,U | RESPONSES-API roles=S,U,A,A,U | RESPONSES-API last=assistant | RESPONSES-API passed=none dropped=top_k,min_p,repetition_penalty,top_a | RESPONSES-API passed=none dropped=top_k | RESPONSES-API passed=none dropped=min_p | RESPONSES-API passed=none dropped=repetition_penalty | RESPONSES-API passed=none dropped=top_a |
| openai/gpt-6-luna | RESPONSES-API roles=S,U,A,S,U | RESPONSES-API kept in place roles=S,U,A,S | RESPONSES-API roles=S,U,U | RESPONSES-API roles=S,U,A,A,U | RESPONSES-API last=assistant | RESPONSES-API passed=none dropped=top_k,min_p,repetition_penalty,top_a | RESPONSES-API passed=none dropped=top_k | RESPONSES-API passed=none dropped=min_p | RESPONSES-API passed=none dropped=repetition_penalty | RESPONSES-API passed=none dropped=top_a |
| openai/gpt-6-sol | RESPONSES-API roles=S,U,A,S,U | RESPONSES-API kept in place roles=S,U,A,S | RESPONSES-API roles=S,U,U | RESPONSES-API roles=S,U,A,A,U | RESPONSES-API last=assistant | RESPONSES-API passed=none dropped=top_k,min_p,repetition_penalty,top_a | RESPONSES-API passed=none dropped=top_k | RESPONSES-API passed=none dropped=min_p | RESPONSES-API passed=none dropped=repetition_penalty | RESPONSES-API passed=none dropped=top_a |
| openai/gpt-6.1-sol | RESPONSES-API roles=S,U,A,S,U | RESPONSES-API kept in place roles=S,U,A,S | RESPONSES-API roles=S,U,U | RESPONSES-API roles=S,U,A,A,U | RESPONSES-API last=assistant | RESPONSES-API passed=none dropped=top_k,min_p,repetition_penalty,top_a | RESPONSES-API passed=none dropped=top_k | RESPONSES-API passed=none dropped=min_p | RESPONSES-API passed=none dropped=repetition_penalty | RESPONSES-API passed=none dropped=top_a |
| openai/gpt-oss-120b | roles=S,U,A,S,U | kept in place roles=S,U,A,S | roles=S,U,U | roles=S,U,A,A,U | last=assistant | passed=top_k,min_p,repetition_penalty dropped=top_a | passed=top_k | passed=min_p | passed=none dropped=repetition_penalty | passed=top_a |
| openai/o3 | RESPONSES-API roles=S,U,A,S,U | RESPONSES-API kept in place roles=S,U,A,S | RESPONSES-API roles=S,U,U | RESPONSES-API roles=S,U,A,A,U | RESPONSES-API last=assistant | RESPONSES-API passed=none dropped=top_k,min_p,repetition_penalty,top_a | RESPONSES-API passed=none dropped=top_k | RESPONSES-API passed=none dropped=min_p | RESPONSES-API passed=none dropped=repetition_penalty | RESPONSES-API passed=none dropped=top_a |
| openai/o3-mini | RESPONSES-API roles=S,U,A,S,U | RESPONSES-API kept in place roles=S,U,A,S | RESPONSES-API roles=S,U,U | RESPONSES-API roles=S,U,A,A,U | RESPONSES-API last=assistant | RESPONSES-API passed=none dropped=top_k,min_p,repetition_penalty,top_a | RESPONSES-API passed=none dropped=top_k | RESPONSES-API passed=none dropped=min_p | RESPONSES-API passed=none dropped=repetition_penalty | RESPONSES-API passed=none dropped=top_a |
| openai/o4-mini | RESPONSES-API roles=S,U,A,S,U | RESPONSES-API kept in place roles=S,U,A,S | RESPONSES-API roles=S,U,U | RESPONSES-API roles=S,U,A,A,U | RESPONSES-API last=assistant | RESPONSES-API passed=none dropped=top_k,min_p,repetition_penalty,top_a | RESPONSES-API passed=none dropped=top_k | RESPONSES-API passed=none dropped=min_p | RESPONSES-API passed=none dropped=repetition_penalty | RESPONSES-API passed=none dropped=top_a |

## OpenRouter: google


#### Turn-structure cases (non-stream status + verdict)

| model | c1_mid_system | c2_tail_system | c3_user_user | c4_asst_asst | c5_prefill |
|---|---|---|---|---|---|
| google/gemini-2.5-flash | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 CONTINUES |
| google/gemini-2.5-flash-lite | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 CONTINUES |
| google/gemini-2.5-pro | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 CONTINUES |
| google/gemini-3-flash-preview | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 CONTINUES |
| google/gemini-3.1-flash-lite | 200 FRENCH | 200 NOT_FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 CONTINUES |
| google/gemini-3.1-pro-preview | 200 FRENCH | 200 NOT_FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 CONTINUES |
| google/gemini-3.5-flash | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 CONTINUES |
| google/gemini-3.5-flash-lite | 200 FRENCH | 400 | 200 SAW_BOTH | 200 REPLIED | 400 |
| google/gemini-3.6-flash | 200 FRENCH | 400 | 200 SAW_BOTH | 200 REPLIED | 400 |
| google/gemini-3.7-flash | 200 FRENCH | 400 | 200 SAW_BOTH | 200 REPLIED | 400 |
| google/gemini-3.8-flash | 200 FRENCH | 400 | 200 SAW_BOTH | 200 REPLIED | 400 |
| google/gemma-4-31b-it | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 RESTARTS |

#### Samplers (non-stream status)

| model | s_all | s_top_k | s_min_p | s_repetition_penalty | s_top_a |
|---|---|---|---|---|---|
| google/gemini-2.5-flash | 200 | 200 | 200 | 200 | 200 |
| google/gemini-2.5-flash-lite | 200 | 200 | 200 | 200 | 200 |
| google/gemini-2.5-pro | 200 | 200 | 200 | 200 | 200 |
| google/gemini-3-flash-preview | 200 | 200 | 200 | 200 | 200 |
| google/gemini-3.1-flash-lite | 200 | 200 | 200 | 200 | 200 |
| google/gemini-3.1-pro-preview | 200 | 200 | 200 | 200 | 200 |
| google/gemini-3.5-flash | 200 | 200 | 200 | 200 | 200 |
| google/gemini-3.5-flash-lite | 200 | 200 | 200 | 200 | 200 |
| google/gemini-3.6-flash | 200 | 200 | 200 | 200 | 200 |
| google/gemini-3.7-flash | 200 | 200 | 200 | 200 | 200 |
| google/gemini-3.8-flash | 200 | 200 | 200 | 200 | 200 |
| google/gemma-4-31b-it | 200 | 200 | 200 | 200 | 200 |

#### What OpenRouter sent upstream (from echo_upstream_body; roles U/A/S, system_field = hoisted)

| model | c1_mid_system | c2_tail_system | c3_user_user | c4_asst_asst | c5_prefill | s_all | s_top_k | s_min_p | s_repetition_penalty | s_top_a |
|---|---|---|---|---|---|---|---|---|---|---|
| google/gemini-2.5-flash | hoisted->system field roles=U,M,U | hoisted->system field roles=U,M | roles=U | roles=U,M,U | last=model | passed=none dropped=top_k,min_p,repetition_penalty,top_a | passed=none dropped=top_k | passed=none dropped=min_p | passed=none dropped=repetition_penalty | passed=none dropped=top_a |
| google/gemini-2.5-flash-lite | hoisted->system field roles=U,M,U | hoisted->system field roles=U,M | roles=U | roles=U,M,U | last=model | passed=none dropped=top_k,min_p,repetition_penalty,top_a | passed=none dropped=top_k | passed=none dropped=min_p | passed=none dropped=repetition_penalty | passed=none dropped=top_a |
| google/gemini-2.5-pro | hoisted->system field roles=U,M,U | hoisted->system field roles=U,M | roles=U | roles=U,M,U | last=model | passed=none dropped=top_k,min_p,repetition_penalty,top_a | passed=none dropped=top_k | passed=none dropped=min_p | passed=none dropped=repetition_penalty | passed=none dropped=top_a |
| google/gemini-3-flash-preview | hoisted->system field roles=U,M,U | hoisted->system field roles=U,M | roles=U | roles=U,M,U | last=model | passed=none dropped=top_k,min_p,repetition_penalty,top_a | passed=none dropped=top_k | passed=none dropped=min_p | passed=none dropped=repetition_penalty | passed=none dropped=top_a |
| google/gemini-3.1-flash-lite | hoisted->system field roles=U,M,U | hoisted->system field roles=U,M | roles=U | roles=U,M,U | last=model | passed=none dropped=top_k,min_p,repetition_penalty,top_a | passed=none dropped=top_k | passed=none dropped=min_p | passed=none dropped=repetition_penalty | passed=none dropped=top_a |
| google/gemini-3.1-pro-preview | hoisted->system field roles=U,M,U | hoisted->system field roles=U,M | roles=U | roles=U,M,U | last=model | passed=none dropped=top_k,min_p,repetition_penalty,top_a | passed=none dropped=top_k | passed=none dropped=min_p | passed=none dropped=repetition_penalty | passed=none dropped=top_a |
| google/gemini-3.5-flash | hoisted->system field roles=U,M,U | hoisted->system field roles=U,M | roles=U | roles=U,M,U | last=model | passed=none dropped=top_k,min_p,repetition_penalty,top_a | passed=none dropped=top_k | passed=none dropped=min_p | passed=none dropped=repetition_penalty | passed=none dropped=top_a |
| google/gemini-3.5-flash-lite | hoisted->system field roles=U,M,U | (no echo: 400) | roles=U | roles=U,M,U | (no echo: 400) | passed=none dropped=top_k,min_p,repetition_penalty,top_a | passed=none dropped=top_k | passed=none dropped=min_p | passed=none dropped=repetition_penalty | passed=none dropped=top_a |
| google/gemini-3.6-flash | hoisted->system field roles=U,M,U | (no echo: 400) | roles=U | roles=U,M,U | (no echo: 400) | passed=none dropped=top_k,min_p,repetition_penalty,top_a | passed=none dropped=top_k | passed=none dropped=min_p | passed=none dropped=repetition_penalty | passed=none dropped=top_a |
| google/gemini-3.7-flash | hoisted->system field roles=U,M,U | (no echo: 400) | roles=U | roles=U,M,U | (no echo: 400) | passed=none dropped=top_k,min_p,repetition_penalty,top_a | passed=none dropped=top_k | passed=none dropped=min_p | passed=none dropped=repetition_penalty | passed=none dropped=top_a |
| google/gemini-3.8-flash | hoisted->system field roles=U,M,U | (no echo: 400) | roles=U | roles=U,M,U | (no echo: 400) | passed=none dropped=top_k,min_p,repetition_penalty,top_a | passed=none dropped=top_k | passed=none dropped=min_p | passed=none dropped=repetition_penalty | passed=none dropped=top_a |
| google/gemma-4-31b-it | roles=S,U,A,S,U | kept in place roles=S,U,A,S | roles=S,U,U | roles=S,U,A,A,U | last=assistant | passed=top_k,repetition_penalty dropped=min_p,top_a | passed=top_k | passed=min_p | passed=repetition_penalty | passed=none dropped=top_a |

## OpenRouter: anthropic


#### Turn-structure cases (non-stream status + verdict)

| model | c1_mid_system | c2_tail_system | c3_user_user | c4_asst_asst | c5_prefill |
|---|---|---|---|---|---|
| anthropic/claude-fable-5 | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 400 |
| anthropic/claude-fable-5.1 | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 400 |
| anthropic/claude-haiku-4.5 | 200 NOT_FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 CONTINUES |
| anthropic/claude-opus-4.1 | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 CONTINUES |
| anthropic/claude-opus-4.5 | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 CONTINUES |
| anthropic/claude-opus-4.6 | 200 FRENCH | 400 | 200 SAW_BOTH | 200 REPLIED | 400 |
| anthropic/claude-opus-4.7 | 200 FRENCH | 400 | 200 SAW_BOTH | 200 REPLIED | 400 |
| anthropic/claude-opus-4.8 | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 400 |
| anthropic/claude-opus-5 | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 400 |
| anthropic/claude-opus-5.5 | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 400 |
| anthropic/claude-sonnet-4 | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 CONTINUES |
| anthropic/claude-sonnet-4.5 | 200 NOT_FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 200 CONTINUES |
| anthropic/claude-sonnet-4.6 | 200 FRENCH | 400 | 200 SAW_BOTH | 200 REPLIED | 400 |
| anthropic/claude-sonnet-5 | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 400 |
| anthropic/claude-sonnet-5.5 | 200 FRENCH | 200 FRENCH | 200 SAW_BOTH | 200 REPLIED | 400 |

#### Samplers (non-stream status)

| model | s_all | s_top_k | s_min_p | s_repetition_penalty | s_top_a |
|---|---|---|---|---|---|
| anthropic/claude-fable-5 | 200 | 200 | 200 | 200 | 200 |
| anthropic/claude-fable-5.1 | 200 | 200 | 200 | 200 | 200 |
| anthropic/claude-haiku-4.5 | 200 | 200 | 200 | 200 | 200 |
| anthropic/claude-opus-4.1 | 200 | 200 | 200 | 200 | 200 |
| anthropic/claude-opus-4.5 | 200 | 200 | 200 | 200 | 200 |
| anthropic/claude-opus-4.6 | 200 | 200 | 200 | 200 | 200 |
| anthropic/claude-opus-4.7 | 200 | 200 | 200 | 200 | 200 |
| anthropic/claude-opus-4.8 | 200 | 200 | 200 | 200 | 200 |
| anthropic/claude-opus-5 | 200 | 200 | 200 | 200 | 200 |
| anthropic/claude-opus-5.5 | 200 | 200 | 200 | 200 | 200 |
| anthropic/claude-sonnet-4 | 200 | 200 | 200 | 200 | 200 |
| anthropic/claude-sonnet-4.5 | 200 | 200 | 200 | 200 | 200 |
| anthropic/claude-sonnet-4.6 | 200 | 200 | 200 | 200 | 200 |
| anthropic/claude-sonnet-5 | 200 | 200 | 200 | 200 | 200 |
| anthropic/claude-sonnet-5.5 | 200 | 200 | 200 | 200 | 200 |

#### What OpenRouter sent upstream (from echo_upstream_body; roles U/A/S, system_field = hoisted)

| model | c1_mid_system | c2_tail_system | c3_user_user | c4_asst_asst | c5_prefill | s_all | s_top_k | s_min_p | s_repetition_penalty | s_top_a |
|---|---|---|---|---|---|---|---|---|---|---|
| anthropic/claude-fable-5 | merged->user roles=U,A,U | merged->user roles=U,A,U | roles=U | roles=U,A,U | (no echo: 400) | passed=none dropped=top_k,min_p,repetition_penalty,top_a | passed=none dropped=top_k | passed=none dropped=min_p | passed=none dropped=repetition_penalty | passed=none dropped=top_a |
| anthropic/claude-fable-5.1 | merged->user roles=U,A,U | merged->user roles=U,A,U | roles=U | roles=U,A,U | (no echo: 400) | passed=none dropped=top_k,min_p,repetition_penalty,top_a | passed=none dropped=top_k | passed=none dropped=min_p | passed=none dropped=repetition_penalty | passed=none dropped=top_a |
| anthropic/claude-haiku-4.5 | hoisted->system field roles=U,A,U | hoisted->system field roles=U,A | roles=U | roles=U,A,U | last=assistant | passed=top_k dropped=min_p,repetition_penalty,top_a | passed=top_k | passed=none dropped=min_p | passed=none dropped=repetition_penalty | passed=none dropped=top_a |
| anthropic/claude-opus-4.1 | hoisted->system field roles=U,A,U | hoisted->system field roles=U,A | roles=U | roles=U,A,U | last=assistant | passed=top_k dropped=min_p,repetition_penalty,top_a | passed=top_k | passed=none dropped=min_p | passed=none dropped=repetition_penalty | passed=none dropped=top_a |
| anthropic/claude-opus-4.5 | hoisted->system field roles=U,A,U | hoisted->system field roles=U,A | roles=U | roles=U,A,U | last=assistant | passed=top_k dropped=min_p,repetition_penalty,top_a | passed=top_k | passed=none dropped=min_p | passed=none dropped=repetition_penalty | passed=none dropped=top_a |
| anthropic/claude-opus-4.6 | hoisted->system field roles=U,A,U | (no echo: 400) | roles=U | roles=U,A,U | (no echo: 400) | passed=none dropped=top_k,min_p,repetition_penalty,top_a | passed=none dropped=top_k | passed=none dropped=min_p | passed=none dropped=repetition_penalty | passed=none dropped=top_a |
| anthropic/claude-opus-4.7 | hoisted->system field roles=U,A,U | (no echo: 400) | roles=U | roles=U,A,U | (no echo: 400) | passed=none dropped=top_k,min_p,repetition_penalty,top_a | passed=none dropped=top_k | passed=none dropped=min_p | passed=none dropped=repetition_penalty | passed=none dropped=top_a |
| anthropic/claude-opus-4.8 | merged->user roles=U,A,U | merged->user roles=U,A,U | roles=U | roles=U,A,U | (no echo: 400) | passed=none dropped=top_k,min_p,repetition_penalty,top_a | passed=none dropped=top_k | passed=none dropped=min_p | passed=none dropped=repetition_penalty | passed=none dropped=top_a |
| anthropic/claude-opus-5 | merged->user roles=U,A,U | merged->user roles=U,A,U | roles=U | roles=U,A,U | (no echo: 400) | passed=none dropped=top_k,min_p,repetition_penalty,top_a | passed=none dropped=top_k | passed=none dropped=min_p | passed=none dropped=repetition_penalty | passed=none dropped=top_a |
| anthropic/claude-opus-5.5 | merged->user roles=U,A,U | merged->user roles=U,A,U | roles=U | roles=U,A,U | (no echo: 400) | passed=none dropped=top_k,min_p,repetition_penalty,top_a | passed=none dropped=top_k | passed=none dropped=min_p | passed=none dropped=repetition_penalty | passed=none dropped=top_a |
| anthropic/claude-sonnet-4 | hoisted->system field roles=U,A,U | hoisted->system field roles=U,A | roles=U | roles=U,A,U | last=assistant | passed=top_k dropped=min_p,repetition_penalty,top_a | passed=top_k | passed=none dropped=min_p | passed=none dropped=repetition_penalty | passed=none dropped=top_a |
| anthropic/claude-sonnet-4.5 | hoisted->system field roles=U,A,U | hoisted->system field roles=U,A | roles=U | roles=U,A,U | last=assistant | passed=top_k dropped=min_p,repetition_penalty,top_a | passed=top_k | passed=none dropped=min_p | passed=none dropped=repetition_penalty | passed=none dropped=top_a |
| anthropic/claude-sonnet-4.6 | hoisted->system field roles=U,A,U | (no echo: 400) | roles=U | roles=U,A,U | (no echo: 400) | passed=none dropped=top_k,min_p,repetition_penalty,top_a | passed=none dropped=top_k | passed=none dropped=min_p | passed=none dropped=repetition_penalty | passed=none dropped=top_a |
| anthropic/claude-sonnet-5 | merged->user roles=U,A,U | merged->user roles=U,A,U | roles=U | roles=U,A,U | (no echo: 400) | passed=none dropped=top_k,min_p,repetition_penalty,top_a | passed=none dropped=top_k | passed=none dropped=min_p | passed=none dropped=repetition_penalty | passed=none dropped=top_a |
| anthropic/claude-sonnet-5.5 | merged->user roles=U,A,U | merged->user roles=U,A,U | roles=U | roles=U,A,U | (no echo: 400) | passed=none dropped=top_k,min_p,repetition_penalty,top_a | passed=none dropped=top_k | passed=none dropped=min_p | passed=none dropped=repetition_penalty | passed=none dropped=top_a |

#### Distinct non-sampler error messages (status, message -> case: models)

- 400 `Provider returned error | raw: {"type":"error","error":{"type":"invalid_request_error","message":"This model does not support assistant message prefill. The conversation ` -> c2_tail_system: claude-opus-4.6, claude-opus-4.7, claude-sonnet-4.6; c5_prefill: claude-fable-5, claude-fable-5.1, claude-opus-4.6, claude-opus-4.7, claude-opus-4.8, claude-opus-5, claude-opus-5.5, claude-sonnet-4.6, claude-sonnet-5, claude-sonnet-5.5
- 400 `Provider returned error | raw: { "error": { "code": 400, "message": "Requests ending with a model turn are not supported.", "status": "INVALID_ARGUMENT" } } ` -> c2_tail_system: gemini-3.5-flash-lite, gemini-3.6-flash, gemini-3.7-flash, gemini-3.8-flash; c5_prefill: gemini-3.5-flash-lite, gemini-3.6-flash, gemini-3.7-flash, gemini-3.8-flash

### Summary per family (OpenRouter)

**claude-fable** (claude-fable-5, claude-fable-5.1)
- midConversationSystem: merged->user/obeyed
- tailSystem: merged->user/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: refused(400)
- top_k: dropped
- min_p: dropped
- repetition_penalty: dropped
- top_a: dropped

**claude-haiku** (claude-haiku-4.5)
- midConversationSystem: hoisted/not_french
- tailSystem: hoisted/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: continues
- top_k: passed
- min_p: dropped
- repetition_penalty: dropped
- top_a: dropped

**claude-opus** (claude-opus-4.1, claude-opus-4.5, claude-opus-4.6, claude-opus-4.7, claude-opus-4.8, claude-opus-5, claude-opus-5.5)
- midConversationSystem: **DISAGREE** hoisted/obeyed [claude-opus-4.1, claude-opus-4.5, claude-opus-4.6, claude-opus-4.7]; merged->user/obeyed [claude-opus-4.8, claude-opus-5, claude-opus-5.5]
- tailSystem: **DISAGREE** hoisted/obeyed [claude-opus-4.1, claude-opus-4.5]; rejected(400) [claude-opus-4.6, claude-opus-4.7]; merged->user/obeyed [claude-opus-4.8, claude-opus-5, claude-opus-5.5]
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: **DISAGREE** continues [claude-opus-4.1, claude-opus-4.5]; refused(400) [claude-opus-4.6, claude-opus-4.7, claude-opus-4.8, claude-opus-5, claude-opus-5.5]
- top_k: **DISAGREE** passed [claude-opus-4.1, claude-opus-4.5]; dropped [claude-opus-4.6, claude-opus-4.7, claude-opus-4.8, claude-opus-5, claude-opus-5.5]
- min_p: dropped
- repetition_penalty: dropped
- top_a: dropped

**claude-sonnet** (claude-sonnet-4, claude-sonnet-4.5, claude-sonnet-4.6, claude-sonnet-5, claude-sonnet-5.5)
- midConversationSystem: **DISAGREE** hoisted/obeyed [claude-sonnet-4, claude-sonnet-4.6]; hoisted/not_french [claude-sonnet-4.5]; merged->user/obeyed [claude-sonnet-5, claude-sonnet-5.5]
- tailSystem: **DISAGREE** hoisted/obeyed [claude-sonnet-4, claude-sonnet-4.5]; rejected(400) [claude-sonnet-4.6]; merged->user/obeyed [claude-sonnet-5, claude-sonnet-5.5]
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: **DISAGREE** continues [claude-sonnet-4, claude-sonnet-4.5]; refused(400) [claude-sonnet-4.6, claude-sonnet-5, claude-sonnet-5.5]
- top_k: **DISAGREE** passed [claude-sonnet-4, claude-sonnet-4.5]; dropped [claude-sonnet-4.6, claude-sonnet-5, claude-sonnet-5.5]
- min_p: dropped
- repetition_penalty: dropped
- top_a: dropped

**gemini-2.5** (gemini-2.5-flash, gemini-2.5-flash-lite, gemini-2.5-pro)
- midConversationSystem: hoisted/obeyed
- tailSystem: hoisted/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: continues
- top_k: dropped
- min_p: dropped
- repetition_penalty: dropped
- top_a: dropped

**gemini-3** (gemini-3-flash-preview)
- midConversationSystem: hoisted/obeyed
- tailSystem: hoisted/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: continues
- top_k: dropped
- min_p: dropped
- repetition_penalty: dropped
- top_a: dropped

**gemini-3.x** (gemini-3.1-flash-lite, gemini-3.1-pro-preview, gemini-3.5-flash, gemini-3.5-flash-lite, gemini-3.6-flash, gemini-3.7-flash, gemini-3.8-flash)
- midConversationSystem: hoisted/obeyed
- tailSystem: **DISAGREE** hoisted/not_french [gemini-3.1-flash-lite, gemini-3.1-pro-preview]; hoisted/obeyed [gemini-3.5-flash]; rejected(400) [gemini-3.5-flash-lite, gemini-3.6-flash, gemini-3.7-flash, gemini-3.8-flash]
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: **DISAGREE** continues [gemini-3.1-flash-lite, gemini-3.1-pro-preview, gemini-3.5-flash]; refused(400) [gemini-3.5-flash-lite, gemini-3.6-flash, gemini-3.7-flash, gemini-3.8-flash]
- top_k: dropped
- min_p: dropped
- repetition_penalty: dropped
- top_a: dropped

**gemma-4** (gemma-4-31b-it)
- midConversationSystem: passed-through/obeyed
- tailSystem: passed-through/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: restarts
- top_k: passed
- min_p: passed
- repetition_penalty: passed
- top_a: dropped

**gpt-4.1** (gpt-4.1, gpt-4.1-mini, gpt-4.1-nano)
- midConversationSystem: passed-through/obeyed
- tailSystem: passed-through/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: restarts
- top_k: dropped
- min_p: dropped
- repetition_penalty: dropped
- top_a: dropped

**gpt-4o** (gpt-4o, gpt-4o-mini)
- midConversationSystem: passed-through/obeyed
- tailSystem: passed-through/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: **DISAGREE** continues [gpt-4o]; restarts [gpt-4o-mini]
- top_k: dropped
- min_p: dropped
- repetition_penalty: dropped
- top_a: dropped

**gpt-5** (gpt-5, gpt-5-mini, gpt-5-nano)
- midConversationSystem: passed-through/obeyed
- tailSystem: passed-through/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: restarts
- top_k: dropped
- min_p: dropped
- repetition_penalty: dropped
- top_a: dropped

**gpt-5.1** (gpt-5.1)
- midConversationSystem: passed-through/obeyed
- tailSystem: passed-through/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: continues
- top_k: dropped
- min_p: dropped
- repetition_penalty: dropped
- top_a: dropped

**gpt-5.2** (gpt-5.2)
- midConversationSystem: passed-through/obeyed
- tailSystem: passed-through/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: restarts
- top_k: dropped
- min_p: dropped
- repetition_penalty: dropped
- top_a: dropped

**gpt-5.4** (gpt-5.4, gpt-5.4-mini, gpt-5.4-nano)
- midConversationSystem: passed-through/obeyed
- tailSystem: passed-through/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: **DISAGREE** continues [gpt-5.4]; restarts [gpt-5.4-mini, gpt-5.4-nano]
- top_k: dropped
- min_p: dropped
- repetition_penalty: dropped
- top_a: dropped

**gpt-5.5** (gpt-5.5)
- midConversationSystem: passed-through/obeyed
- tailSystem: passed-through/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: restarts
- top_k: dropped
- min_p: dropped
- repetition_penalty: dropped
- top_a: dropped

**gpt-5.6** (gpt-5.6-luna, gpt-5.6-sol, gpt-5.6-terra)
- midConversationSystem: passed-through/obeyed
- tailSystem: passed-through/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: restarts
- top_k: dropped
- min_p: dropped
- repetition_penalty: dropped
- top_a: dropped

**gpt-6** (gpt-6-astra, gpt-6-luna, gpt-6-sol)
- midConversationSystem: passed-through/obeyed
- tailSystem: passed-through/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: restarts
- top_k: dropped
- min_p: dropped
- repetition_penalty: dropped
- top_a: dropped

**gpt-6.1** (gpt-6.1-sol)
- midConversationSystem: passed-through/obeyed
- tailSystem: passed-through/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: restarts
- top_k: dropped
- min_p: dropped
- repetition_penalty: dropped
- top_a: dropped

**gpt-oss** (gpt-oss-120b)
- midConversationSystem: passed-through/obeyed
- tailSystem: passed-through/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: restarts
- top_k: passed
- min_p: passed
- repetition_penalty: dropped
- top_a: passed

**o-series** (o3, o3-mini, o4-mini)
- midConversationSystem: passed-through/obeyed
- tailSystem: passed-through/obeyed
- adjUser: ok/saw_both
- adjAssistant: ok/replied
- assistantPrefill: restarts
- top_k: dropped
- min_p: dropped
- repetition_penalty: dropped
- top_a: dropped
