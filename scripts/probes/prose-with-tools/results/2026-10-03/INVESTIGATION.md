# Why the co-emission rates were inconsistent

The first run (`RESULTS.md`) measured a hand-built request on a transcript that drifted per run. This investigation
records what the app actually sends, replays it with the history and state fixed, and repeats every beat ten times
per stream mode. Raw replies are in `replay/<cell>.jsonl`, the recorded app requests in `app-requests/`, and
server-rendered prompts in `rendered/`.

## Verdict

The inconsistency is not the model, the server or the stream mode. Two settings outside any capability row decide
the outcome, and the first run held one of them at a value the app does not send:

1. **Thinking.** With thinking on, Qwen3.8-27B reasons and then answers with tool calls only, on vLLM (82–95% of
   turns tools-only) and on llama.cpp (96–99%). That is the original 36/36 symptom. With thinking off it
   co-emits on 65–83% of turns. The app sends no thinking control, so each server's own default decides: the
   owner's vLLM launch defaults thinking off, and llama.cpp follows the template, which defaults it on.
2. **llama.cpp reasoning preserve.** llama.cpp preserves reasoning by default and renders an empty
   `<think></think>` block before every earlier assistant reply. With thinking off and preserve on, co-emission falls
   to 20–24% and most turns are prose-only. With `--no-reasoning-preserve` it rises to 80%, level with vLLM.

Once the request and the transcript are fixed, streaming and non-streaming do not differ.

## Hypotheses

| # | Hypothesis | Verdict | Evidence |
| - | - | - | - |
| 1 | Sampling is not controlled | Mostly refuted | The app sends no sampling fields (`app-requests/*/turn-*.json`: `max_tokens`, `tool_choice`, `stream`, `tools`, `messages` only), and neither did the probe. vLLM samples with the checkpoint's `generation_config.json`: temperature 1.0, top_k 20, top_p 0.95. llama.cpp reads the same values from the GGUF (`/props`: 1.0 / 20 / 0.95, plus min_p 0.05). The first run's vLLM and llama.cpp cells sampled alike and as the app does. Temperature 1.0 is itself the noise source: one beat swings from 1/10 to 10/10. |
| 2 | The transcript diverges per run | Confirmed, partly | The game master history was canned, but each reply's tool calls moved the tracked state, so the reminder differed from turn 2 on: prompt tokens differ between modes on turns 2–10 in every cell. vLLM's own repeats in one mode varied as much as the modes did (`BBBTBBBTBB` vs `BTBTTPTBTP`, both streaming). |
| 3 | Co-emission tracks the beat | Confirmed | On the fixed replay, vLLM ranges from 1–2/10 (beat 8) to 10/10 (beat 6) at the same settings. Greedy decoding makes beats 1, 4 and 7 tools-only every time and the rest co-emit every time. |
| 4 | The probe's prompt is not the app's | Confirmed | The app's request differs in the system prompt (the character and persona framing), the history (it opens with `[Start a new chat]` and the greeting), the reminder (a "Game notes for the narrator" frame plus the immersive-card directive), the `no_changes` description ("Every turn MUST emit at least one state-bookkeeping tool call…"), and `max_tokens` (2048, not 1200). On vLLM the app's prompt co-emits 65% against the probe's 40–53%. |
| 5 | Thinking off still emits a think block that changes behaviour | Confirmed, and decisive | vLLM renders the generation prompt as `<think>\n\n</think>\n\n` (thinking off by its launch default). llama.cpp renders the app's request as `<think>\n` (thinking on), and with preserve on adds an empty think block to each earlier assistant turn (`rendered/`). The table below measures both effects. |

## Per-beat replay

Ten repeats per beat per mode on the app's recorded request, server sampling defaults, 27B only. vLLM runs W8A8
on GPU 1; llama.cpp runs UD-Q4_K_M on GPU 0. "Both" counts replies with at least 40 characters of prose and at
least one parsed tool call.

| Cell | Mode | B1 | B2 | B3 | B4 | B5 | B6 | B7 | B8 | B9 | B10 | Both | 95% CI | Prose only | Tools only | Empty | Leaks | Errors | Length cut |
| - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| llamacpp-app-thinkoff-nopreserve | nonstream | 7/10 | 8/10 | 7/10 | 10/10 | 9/10 | 10/10 | 8/10 | 9/10 | 9/10 | 6/10 | 83/100 | 74–89% | 8 | 9 | 0 | 0 | 0 | 0 |
| llamacpp-app-thinkoff-nopreserve | stream | 7/10 | 6/10 | 9/10 | 7/10 | 8/10 | 10/10 | 6/10 | 10/10 | 9/10 | 8/10 | 80/100 | 71–87% | 9 | 11 | 0 | 0 | 0 | 0 |
| llamacpp-app-thinkoff | nonstream | 6/10 | 5/10 | 3/10 | 1/10 | 1/10 | 2/10 | 1/10 | 2/10 | 2/10 | 1/10 | 24/100 | 17–33% | 69 | 7 | 0 | 0 | 0 | 0 |
| llamacpp-app-thinkoff | stream | 7/10 | 6/10 | 0/10 | 0/10 | 3/10 | 2/10 | 0/10 | 1/10 | 1/10 | 0/10 | 20/100 | 13–29% | 70 | 10 | 0 | 0 | 0 | 0 |
| llamacpp-app | nonstream | 0/10 | 0/10 | 1/10 | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 | 1/100 | 0–5% | 0 | 99 | 0 | 0 | 0 | 0 |
| llamacpp-app | stream | 0/10 | 2/10 | 0/10 | 0/10 | 1/10 | 0/10 | 0/10 | 0/10 | 1/10 | 0/10 | 4/100 | 2–10% | 0 | 96 | 0 | 0 | 0 | 0 |
| llamacpp-greedy | nonstream | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/30 | 0–11% | 0 | 30 | 0 | 0 | 0 | 0 |
| llamacpp-greedy | stream | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/30 | 0–11% | 0 | 30 | 0 | 0 | 0 | 0 |
| vllm-app-thinkon | nonstream | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 | 1/10 | 1/10 | 1/10 | 0/10 | 0/10 | 3/100 | 1–8% | 1 | 95 | 1 | 1 | 0 | 2 |
| vllm-app-thinkon | stream | 0/10 | 1/10 | 4/10 | 1/10 | 0/10 | 4/10 | 1/10 | 1/10 | 1/10 | 0/10 | 13/100 | 8–21% | 1 | 82 | 4 | 0 | 0 | 5 |
| vllm-app | nonstream | 4/10 | 10/10 | 6/10 | 5/10 | 8/10 | 10/10 | 3/10 | 2/10 | 8/10 | 9/10 | 65/100 | 55–74% | 10 | 25 | 0 | 0 | 0 | 0 |
| vllm-app | stream | 5/10 | 9/10 | 7/10 | 4/10 | 8/10 | 10/10 | 5/10 | 1/10 | 8/10 | 9/10 | 66/100 | 56–75% | 9 | 25 | 0 | 0 | 0 | 0 |
| vllm-greedy-serial | nonstream | 0/3 | 3/3 | 3/3 | 0/3 | 3/3 | 3/3 | 0/3 | 3/3 | 3/3 | 3/3 | 21/30 | 52–83% | 0 | 9 | 0 | 0 | 0 | 0 |
| vllm-greedy-serial | stream | 0/3 | 3/3 | 3/3 | 0/3 | 3/3 | 3/3 | 0/3 | 3/3 | 3/3 | 3/3 | 21/30 | 52–83% | 0 | 9 | 0 | 0 | 0 | 0 |
| vllm-greedy | nonstream | 1/3 | 3/3 | 3/3 | 0/3 | 0/3 | 3/3 | 3/3 | 0/3 | 3/3 | 3/3 | 19/30 | 46–78% | 2 | 9 | 0 | 0 | 0 | 0 |
| vllm-greedy | stream | 2/3 | 2/3 | 2/3 | 0/3 | 1/3 | 3/3 | 2/3 | 1/3 | 3/3 | 3/3 | 19/30 | 46–78% | 1 | 10 | 0 | 0 | 0 | 0 |

- `vllm-app` and `llamacpp-app` are exactly what the app sends. `thinkon` / `thinkoff` add
  `chat_template_kwargs.enable_thinking`. `nopreserve` is llama.cpp started with `--no-reasoning-preserve`.
- `greedy` adds `temperature: 0, seed: 42` (three repeats). vLLM is not deterministic under batching: with eight
  requests in flight, only 4 of 20 beat×mode groups repeated byte for byte. One request at a time, 18 of 20 did,
  and the shapes matched between streaming and non-streaming on all 10 beats. llama.cpp greedy repeated 20 of 20,
  and streaming matched non-streaming byte for byte on all 10 beats.
- Every empty reply, leaked-markup reply, and `max_tokens` cut came from the thinking-on vLLM cell. No other cell had any. The first
  llama.cpp attempt ran four requests into a 16K window shared between its slots, and it overflowed ("Context size
  has been exceeded."). Those replies were discarded, and the server was restarted with a 64K shared window; the
  replay now records a mid-stream error frame as an error, not as an empty reply.

## Stream against non-stream

Once the transcript is fixed, they agree. vLLM shows 66/100 against 65/100. Greedy shapes are identical on every
beat on both servers. The 8/10 against 2/10 gap in the first run was sampling at temperature 1.0 over a different
reminder per run.

## Re-measure with the thinking state sent explicitly

The app now sends the template's thinking state on every row with a thinking switch (`features.thinkingOff`).
A folded RPG turn with reasoning unset sends `chat_template_kwargs.enable_thinking: false`. The recorded
requests in `app-requests-explicit/` differ from `app-requests/` by that one key and nothing else. Replies
are in `replay-explicit/`. Ten repeats per beat per mode give 100 replies per cell and mode.

| Cell | Mode | B1 | B2 | B3 | B4 | B5 | B6 | B7 | B8 | B9 | B10 | Both | 95% CI | Prose only | Tools only | Empty | Leaks | Errors | Length cut |
| - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| explicit-llamacpp-default-preserve-off-per-request | nonstream | 7/10 | 9/10 | 6/10 | 8/10 | 10/10 | 7/10 | 8/10 | 9/10 | 8/10 | 9/10 | 81/100 | 72–87% | 14 | 5 | 0 | 0 | 0 | 0 |
| explicit-llamacpp-default-preserve-off-per-request | stream | 8/10 | 9/10 | 9/10 | 7/10 | 7/10 | 9/10 | 8/10 | 8/10 | 10/10 | 7/10 | 82/100 | 73–88% | 5 | 13 | 0 | 0 | 0 | 0 |
| explicit-llamacpp-default | nonstream | 6/10 | 5/10 | 2/10 | 2/10 | 2/10 | 4/10 | 1/10 | 0/10 | 3/10 | 0/10 | 25/100 | 18–34% | 69 | 5 | 1 | 0 | 0 | 0 |
| explicit-llamacpp-default | stream | 2/10 | 8/10 | 3/10 | 2/10 | 0/10 | 1/10 | 2/10 | 2/10 | 1/10 | 1/10 | 22/100 | 15–31% | 72 | 6 | 0 | 0 | 0 | 0 |
| explicit-llamacpp-no-reasoning-preserve | nonstream | 6/10 | 4/10 | 7/10 | 9/10 | 10/10 | 9/10 | 9/10 | 7/10 | 9/10 | 8/10 | 78/100 | 69–85% | 15 | 7 | 0 | 0 | 0 | 0 |
| explicit-llamacpp-no-reasoning-preserve | stream | 9/10 | 7/10 | 8/10 | 9/10 | 10/10 | 9/10 | 8/10 | 9/10 | 9/10 | 8/10 | 86/100 | 78–91% | 11 | 3 | 0 | 0 | 0 | 0 |
| explicit-vllm | nonstream | 3/10 | 10/10 | 4/10 | 5/10 | 4/10 | 9/10 | 2/10 | 2/10 | 10/10 | 3/10 | 52/100 | 42–62% | 12 | 36 | 0 | 0 | 0 | 0 |
| explicit-vllm | stream | 5/10 | 7/10 | 5/10 | 3/10 | 9/10 | 10/10 | 9/10 | 1/10 | 10/10 | 7/10 | 66/100 | 56–75% | 11 | 23 | 0 | 0 | 0 | 0 |

- `explicit-vllm` is vLLM 0.29.0 on GPU 1, launched as before (the owner's thinking-off default). Its
  request did not change in effect: 66/100 streaming matches the first replay (66/100). The non-streaming
  52/100 against the first replay's 65/100 is run-to-run sampling at temperature 1.0. The intervals overlap
  (42–62% against 55–74%).
- `explicit-llamacpp-default` is llama.cpp on GPU 0 with its default flags. Sending thinking off removes the
  thinking-on failure (it was 1–4% co-emission, 96–99% tools-only). Reasoning preserve still holds the rate at
  22–25%, mostly prose-only.
- `explicit-llamacpp-default-preserve-off-per-request` is the same server with
  `chat_template_kwargs.preserve_reasoning: false` added to the request: 81–82%.
- `explicit-llamacpp-no-reasoning-preserve` is llama.cpp started with `--no-reasoning-preserve`: 78–86%.
- No cell had an empty reply, an error or a leak beyond one empty llama.cpp default reply.

### llama.cpp reasoning preserve has a per-request knob

`chat_template_kwargs.preserve_reasoning` is read per request. llama.cpp merges the request's
`chat_template_kwargs` over its launch defaults (`tools/server/server-common.cpp:1356-1359`, HEAD a55e952).
`common/chat.cpp:940-942` then applies the boolean, which sets the template's
`preserve_thinking` / `clear_thinking` / `drop_thinking` variables (`common/jinja/caps.cpp:22-27`).
`--no-reasoning-preserve` only changes the launch default of the same kwarg (`common/arg.cpp:3735-3746`). On
the recorded turn-10 request, `/apply-template` renders 11 empty think blocks by default, and 1 (the
generation prompt) with `preserve_reasoning: false`. The template's own `preserve_thinking` kwarg does not
override llama.cpp's setting. The measured effect equals the launch flag (81–82% against 78–86%).

The app does not send `preserve_reasoning` today. Sending it is a new key, and the brief ruled out a new knob
in this leg. It is listed for the owner's call.

## Is there a bar to set

Not per (model × server). The rate moves from about 3% to 80% for the same model on the same server, on
settings no capability row can see:

- whether thinking is on, which is the server's launch default unless the request sets it;
- whether llama.cpp preserves reasoning, which is a launch flag;
- the vLLM tool parser, which made no difference here: the same sampled tokens parsed the same.

At fixed settings the rate is stable enough to bound. One hundred replies per mode give a 95% interval about
±9 points, for example vLLM thinking off at 56–75%. Ten replies, as in the first run, gave about ±30.

Recommendation, for the owner to rule:

1. Do not write `silencesProse: false` from these rows yet. A row keyed on (model × server) would be wrong
   whenever thinking is on, and it is on by default on llama.cpp and in any vLLM launch without the owner's flag.
2. The app now sends the thinking state explicitly (the re-measure above), so the measured condition is the
   condition at run time for thinking. llama.cpp's reasoning preserve still decides its rate, and only a
   launch flag or a per-request `preserve_reasoning: false` the app does not send yet changes it.
3. With that in place, a defensible bar is a lower 95% bound of at least 50% co-emission, over at least 100
   replies per stream mode, on the app's recorded request. vLLM thinking off (56–75%) and llama.cpp thinking off
   without preserve (71–87% streaming) clear it. llama.cpp with its default preserve (13–33%) and every
   thinking-on cell do not.
4. A miss still loses no output: a tools-only turn takes the engine's narrative recovery pass, and a prose-only
   turn takes the post-commit round. The bar is about cost, not correctness.

## Not covered

Ollama and KoboldCpp were not re-measured; their first-run cells forced thinking off, which the app does not send.
The capture recorded the vLLM and llama.cpp request shapes only.
