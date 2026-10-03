# Smart-picker live matrix: results

Run 2026-10-03 on branch `wt/agent-a35378799df0d73a3`. The current verdict is for `748d598052`: the
side-gen reasoning fix `2b257a5d4f` plus a docs-only main merge, with no product diff between them. Every row
in `results.jsonl` carries `tree.head`, and `tree.dirtyProduct` is false for all of them. Rows without `tree`
predate the tag and come from the pre-fix tree `4fd95384e6`. `node scripts/probes/smart-picker-live/run.ts
report` prints the per-cell table from each cell's latest run. [`README.md`](README.md) describes how the probe
drives the production path.

## Verdict on 748d598052

The structured-only arbiter returns a valid pick on 9 of 9 scenes on eight cells: OpenAI, Anthropic direct,
three Claude models through OpenRouter, vLLM, Ollama and KoboldCpp. Every pick was a member of the round's
label enum. The enum on the wire matched the round's labels in all 112 captured requests that carried one: the
two seats named Rook went as `Rook` and `Rook (2)`, and the self-response round left the last speaker out. The
reranker returns a valid pick on 9 of 9 scenes. On every cell, a model the provider does not serve and an
unbound row both degraded, and no model scene on a passing cell degraded.

Still open: llama.cpp with Gemma 4, which is lane 0512's `body.ts` change, and DeepSeek through a Custom
connection, which waits on item 0518. Gemini is **pending: quota, reset 23:59:59 UTC, runs on the final tree**.

## Matrix (748d598052)

"Scenes pass" means a valid, non-degraded pick on each of the 9 scenes, with a model call exactly when the scene
needs one: `clear-name` and `clear-names` resolve without a call. "Quality hits" counts valid picks inside
the hand judgment, over the 8 judged scenes; the open floor is not judged. Latency is wall time per round,
through the app's runtime, over the 7 rounds that called the model.

| cell | device | model | scenes pass | quality hits | latency median / max ms | vehicle on the wire | missing-model degrades | unbound degrades |
| - | - | - | - | - | - | - | - | - |
| OpenAI direct | hosted | `gpt-5.4-mini` | 9/9 | 7/8 | 871 / 1739 | `response_format: json_schema` | pass | pass |
| Anthropic direct | hosted | `claude-sonnet-5-5` | 9/9 | 8/8 | 1720 / 2085 | `output_config.format: json_schema` | pass | pass |
| OpenRouter | hosted | `anthropic/claude-sonnet-5.5` | 9/9 | 7/8 | 1958 / 2191 | `response_format: json_schema` | pass | pass |
| OpenRouter | hosted | `anthropic/claude-sonnet-4.6` | 9/9 | 8/8 | 1244 / 1327 | `response_format: json_schema` | pass | pass |
| OpenRouter | hosted | `anthropic/claude-haiku-4.5` | 9/9 | 8/8 | 1246 / 2000 | `response_format: json_schema` | pass | pass |
| Gemini direct (native wire) | hosted | `gemini-3.8-flash` | pending: quota | - | - | `generationConfig` JSON schema | pass | pass |
| Gemini compat (Custom, `v1beta/openai`) | hosted | `gemini-3.8-flash` | pending: quota | - | - | `response_format: json_schema` | pass | pass |
| DeepSeek (Custom) | hosted | `deepseek-flash` | not configurable until 0518 | - | - | none | pass | pass |
| vLLM | GPU 1 | `qwen3.8-27b` (Qwen3.8-27B W8A8) | 9/9 | 7/8 | 622 / 1131 | `response_format: json_schema` | pass | pass |
| llama.cpp (on `2b257a5d4f`) | GPU 1 | `gemma-4-e4b-it` (gemma-4-E4B-it Q8_0) | **2/9** | - | 2779 / 3060 | `response_format: json_schema` | pass | pass |
| Ollama | GPU 0 | `gemma4:e4b` | 9/9 | 8/8 | 317 / 4665 | Ollama `format` schema | pass | pass |
| KoboldCpp | GPU 0 | `koboldcpp/gemma-4-E4B-it-Q8_0` | 9/9 | 7/8 | 392 / 452 | `response_format: json_schema` | pass | pass |
| Reranker, built-in local-light | CPU | `Xenova/ms-marco-MiniLM-L-6-v2` | 9/9 | 7/8 | 29 / 390 (first call loads) | rerank | pass | pass |

Per-scene picks, by cast key. `+` joins several responders; "(miss)" marks a valid pick outside the hand judgment.

| cell | open floor | role-addressed | clear name | clear names | player shares name | duplicate names | narrator | off-roster | self-response |
| - | - | - | - | - | - | - | - | - | - |
| OpenAI gpt-5.4-mini | brannoc+quill | liesel | brannoc | liesel+quill | ash | rook-thief | narrator+elara (miss) | mara | brannoc |
| Anthropic claude-sonnet-5-5 | brannoc | liesel | brannoc | liesel+quill | ash | rook-thief | narrator | vex | brannoc |
| OR claude-sonnet-5.5 | brannoc | liesel | brannoc | liesel+quill | mara (miss) | rook-thief | narrator | mara | brannoc |
| OR claude-sonnet-4.6 | brannoc | liesel | brannoc | liesel+quill | ash | rook-thief | narrator | vex | brannoc |
| OR claude-haiku-4.5 | quill | liesel | brannoc | liesel+quill | ash | rook-thief | narrator | mara | brannoc |
| vLLM qwen3.8-27b | brannoc | liesel | brannoc | liesel+quill | ash | rook-thief | elara (miss) | mara | brannoc |
| Ollama gemma4:e4b | brannoc+quill | liesel | brannoc | liesel+quill | ash | rook-thief | narrator | vex | brannoc |
| KoboldCpp gemma-4-E4B | brannoc+quill | liesel | brannoc | liesel+quill | ash | rook-thief | elara (miss) | vex | brannoc |
| Reranker | liesel | liesel | brannoc | quill+liesel | ash | rook-thief | elara (miss) | vex | brannoc |

Reranker order on the ranked scenes, scores from one call: open floor Liesel -10.92, Brannoc -10.99, Quill -11.03;
player shares name Ash -4.02, Vex -7.27, Mara -11.13; duplicate names Rook (thief) -3.54, Rook (guard) -8.80;
off-roster Vex -8.65, Mara -9.60, Ash -9.91; self-response Quill -3.88, Brannoc -9.61, Liesel -10.87. In the
self-response round Quill is banned as the last speaker, so Brannoc answers.

## What the fix changed on the wire

Each line below is the arbiter body beside its messages and schema, from the `bodyKnobs` of the `open-floor`
rows.

- OpenAI: `reasoning_effort: "none"`, `max_completion_tokens: 128`.
- Anthropic direct: `max_tokens: 128`, `thinking: {type: "between_tools"}`.
- OR claude-sonnet-4.6 and haiku-4.5: `max_tokens: 128`, `temperature: 0.2`, `reasoning: {effort: "none"}`.
  OpenRouter forwards `thinking: {type: "disabled"}`.
- OR claude-sonnet-5.5: `reasoning: {effort: "low"}`, `max_tokens: 3353`. OpenRouter's `echo_upstream_body`
  still shows `thinking: {type: "adaptive", display: "summarized"}`, with `temperature` dropped, `max_tokens
  3353` and `response_format` moved to `output_config.format` with `strict` dropped. The model still reasons,
  but the output room now holds the answer.
- Ollama: `think: false`, `options: {num_predict: 128, temperature: 0.2, num_ctx: 4096}`.
- KoboldCpp and llama.cpp: `max_tokens: 128`, `temperature: 0.2`, `chat_template_kwargs: {enable_thinking: false}`.

## Defects found by this matrix

Each was found on the pre-fix tree `4fd95384e6` and routed by the orchestrator.

1. **OR `anthropic/claude-sonnet-5.5` never turned reasoning off.** The app body carried no `reasoning`
   field, and OpenRouter defaulted to adaptive thinking, which spent the 128-token arbiter cap
   (`SIDE_GEN_POSTURES.arbiter`, `packages/contracts/src/preset/index.ts:203`): `finish_reason: length` and
   empty content, twice, then a degrade. The pre-fix result was 7/9 (`player-shares-name` and
   `duplicate-names` degraded). Fixed in `2b257a5d4f`.
2. **Ollama sent no `think: false`.** The model reasoned until `num_predict` ran out; the pre-fix result was
   2/9. Fixed in `2b257a5d4f`.
3. **The reranker banned the last speaker after a human line.** `rerank-pick.ts` `topAllowed` dropped the last
   speaker whenever the round banned it. In `role-addressed` it ranked Liesel, the healer, first, then banned
   her and picked Brannoc. Fixed in `2b257a5d4f`: `role-addressed` now picks Liesel.
4. **llama.cpp with Gemma 4: the template switch does not hold under a JSON schema. Open; routed to lane
   0512.** Gemma 4 obeys `enable_thinking: false` until the request carries a `json_schema`. With one, it
   reasons about 470 characters of `reasoning_content` into the 128-token cap. Sending
   `thinking_budget_tokens: 0`, the llama-cpp row's own `reasoningBudgetField`, returns `{"responders": [...]}`
   with `stop`, checked against the live server.

Not a 0492 defect: **DeepSeek through a Custom connection is not configurable until 0518.** With nothing
declared, the row states neither structured output nor tools, so `speakerArbiterFor` returns null and the round
degrades without a call. With tools declared, the forced named tool is refused by DeepSeek's default thinking
mode: 400 "Thinking mode does not support this tool_choice". With structured output declared, `json_schema` is
refused: 400 "This response_format type is unavailable now". These two declared variants ran only on the
pre-fix tree.

## Gemini: pending on the probe key's quota

`GEMINI_PROBE_KEY` is on the free tier, with `generate_content_free_tier_requests` limited to 20 per day per
model. The first pre-fix round got a 503 "high demand". Every later round got a 429 RESOURCE_EXHAUSTED; the
first came at 20:54:46Z with "Please retry in 3h5m13s". The quota resets at 23:59:59 UTC, and the cells run on
the final tree. The rows still show the wiring: the native wire resolved `gemini-3.8-flash` with structured
output and sent the `generationConfig` schema with the label enum, and both controls degraded.

## Exact launches

All instances below were torn down after the run, and both GPUs returned to their baseline. GPU 0 runs
ComfyUI at about 4.8 GiB, which was never touched.

vLLM 0.29.0 ran on GPU 1 alone. The launcher is the owner's `serve-27b.sh`, unchanged; its trailing `"$@"`
overrides what one card cannot hold, because the script itself asks for TP 2 and 262144 context across both
cards. `--max-num-seqs 64` is the Mamba-cache boot fix: the first boot without it died with "max_num_seqs
(256) exceeds available Mamba cache blocks (176)" at 9.15 GiB of KV cache on one card. A boot with the
llama.cpp container on the same card also failed, so llama.cpp was removed before the post-fix boot.

```sh
CUDA_VISIBLE_DEVICES=1 setsid nohup ~/qwen-local/bin/serve-27b.sh \
  /media/inktomi/Data/vllm-models/quantized/Qwen3.8-27B-W8A8-Dynamic-Per-Token \
  --tensor-parallel-size 1 --max-model-len 32768 --max-num-seqs 64 --port 28941
```

The argv vLLM ran, from `ps`: `vllm serve <model> --served-model-name qwen3.8-27b <model> --tensor-parallel-size 2
--host 127.0.0.1 --port 8901 --gpu-memory-utilization 0.90 --max-num-batched-tokens 8192 --max-model-len 262144
--reasoning-parser qwen3 --chat-template ~/qwen-local/templates/qwen3_gen_thinking_serve.jinja
--default-chat-template-kwargs {"enable_thinking": false, "preserve_thinking": false} --structured-outputs-config
{"enable_in_reasoning": false} --enable-auto-tool-choice --tool-call-parser qwen3_coder --speculative-config
{"method":"mtp","num_speculative_tokens":2} --enable-prefix-caching --mm-encoder-tp-mode data
--mm-processor-cache-type shm --disable-access-log-for-endpoints /health,/metrics,/ping --enable-request-id-headers
--enable-force-include-usage --tensor-parallel-size 1 --max-model-len 32768 --max-num-seqs 64 --port 28941`.
The later flags win. vLLM's `non-default args` line confirms TP 1, a 32768 context and port 28941.

llama.cpp ran on GPU 1 (`ghcr.io/ggml-org/llama.cpp:server-cuda`, build 11371 `99b95488c`):

```sh
docker run -d --name lane492-llamacpp --gpus '"device=1"' -p 127.0.0.1:28942:8080 \
  -v /media/inktomi/Data/vllm-models/gguf/lane492:/models:ro ghcr.io/ggml-org/llama.cpp:server-cuda \
  -m /models/gemma-4-E4B-it-Q8_0.gguf --alias gemma-4-e4b-it --jinja -ngl 99 -c 16384 --host 0.0.0.0 --port 8080 --no-webui
```

Ollama ran on GPU 0 (`ollama/ollama:latest`, 0.35.1), with the model pulled from the Ollama library:

```sh
docker run -d --name lane492-ollama --gpus '"device=0"' -p 127.0.0.1:28943:11434 \
  -v lane492-ollama-data:/root/.ollama -e OLLAMA_HOST=0.0.0.0 ollama/ollama:latest
docker exec lane492-ollama ollama pull gemma4:e4b
```

KoboldCpp ran on GPU 0 (`koboldai/koboldcpp:latest`, 1.122.1):

```sh
docker run -d --name lane492-kobold --gpus '"device=0"' -p 127.0.0.1:28944:5001 \
  -v /media/inktomi/Data/vllm-models/gguf/lane492:/models:ro -e KCPP_DONT_TUNNEL=true \
  -e KCPP_ARGS="--model /models/gemma-4-E4B-it-Q8_0.gguf --host 0.0.0.0 --port 5001 --contextsize 16384 --usecuda --gpulayers 99 --jinja --jinjatools --quiet" \
  koboldai/koboldcpp:latest
```

The GGUF is `ggml-org/gemma-4-E4B-it-GGUF` `gemma-4-E4B-it-Q8_0.gguf`, kept at
`/media/inktomi/Data/vllm-models/gguf/lane492/`. The reranker is the shipped `Xenova/ms-marco-MiniLM-L-6-v2`
files, copied from the stack's model cache, run on CPU by the local-light worker. onnxruntime logs a missing
CUDA provider library and falls back to CPU.

## Quality notes

- The narrator seat is the hardest scene. Only the Claude models and Ollama named the Narrator alone. vLLM,
  KoboldCpp and the reranker chose the ranger Elara: a valid in-enum pick, but a miss against the hand judgment.
- OR claude-sonnet-5.5, now reasoning at low effort, answered the player-shares-name scene with Mara. Mara is in
  the enum, but the scene's line sends the forge chore to Ash, the apprentice.
