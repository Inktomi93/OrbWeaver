# Local server probes — results

Rig: `rig.sh`, CPU only, `--cpus 4 --memory 6g` per container, loopback ports 28111–28118. Servers as pulled
on the run date: Ollama `0.35.1`, llama.cpp server `b11347-5fc4f3c8c`, KoboldCpp `1.122.1`. Models:
Qwen2.5-0.5B-Instruct Q4_K_M, SmolVLM-256M-Instruct Q8_0 + mmproj, nomic-embed-text-v1.5 Q8_0; on Ollama
`qwen2.5:0.5b`, `moondream`, `nomic-embed-text`. Raw evidence: `results/<arm>.jsonl` (gitignored) and the
recorded advertisements in `tests/inference/catalog/_local-servers-fixtures.ts`.

## Detected versus proven

"Detected" is what `fetchEndpointModels` read through the arm's `modelInfoApi`; "proven" is the probe
against the same server. Every stated capability held, and every negative control held where the server
refuses.

| Arm | Detected | Proven |
| - | - | - |
| `ollama` `qwen2.5:0.5b` | generation · text only · tools (`parallel: false`) · structured (`0.35.1 ≥ 0.5.0`) · window not stated | tool call round-trips (`get_weather` with `{"city":"Paris"}`); an image part is refused 400 "Multimodal data provided, but model does not support multimodal requests"; JSON-schema `response_format` parses |
| `ollama` `moondream:latest` | generation · text + image · no tools | a red square reads "red"; `tools[]` is refused 400 "does not support tools" |
| `ollama` `nomic-embed-text:latest` | embedding · 768 wide · window 8192 (Modelfile `num_ctx`) | `/v1/embeddings` returns a 768-wide vector |
| `llamacpp-chat` (Qwen, `--jinja`) | text only · tools (`parallel: true` from `chat_template_caps`) · structured (`b11347 ≥ b2480`) · window 4096 (`meta.n_ctx`) | tool call round-trips; an image part is refused 500 "image input is not supported"; JSON-schema parses |
| `llamacpp-vision` (SmolVLM + mmproj) | text + image + video · no tools (template caps all false) | a red square reads "Red" |
| `llamacpp-embed` (nomic, `--embedding`) | 768 wide (`meta.n_embd`) · window 2048 | `/v1/embeddings` returns a 768-wide vector |
| `llamacpp-router` (`--models-dir`) | per row from `architecture.input_modalities`: Qwen text, SmolVLM text + image · tools not stated · window not stated | no probe: a chat request would load a model as a side effect, which the reader avoids on purpose |
| `kobold-chat` (Qwen, `--jinja --jinjatools`, nomic embedder) | text only · structured (`1.122.1 ≥ 1.90`) · window 4096 · tools not stated | JSON-schema parses; `/v1/embeddings` returns 768 wide (no width advertised, so unverifiable from the catalog); `tools[]` is accepted (200) but the call came back as content `<tool_call>{{"name": …}}</tool_call>`, not `tool_calls` |
| `kobold-universal` (Qwen, KoboldCpp's own tool injection) | same as above | `tools[]` accepted (200); the call came back as a fenced JSON block, not `tool_calls` |
| `kobold-vision` (SmolVLM + mmproj) | text + image | a red square reads "Red." |

Negative control that does NOT hold on KoboldCpp: an image part sent to its text model is accepted and
dropped silently; the model answered "Red" to "what colour is this image" with no image in context
(`results/kobold-chat.jsonl`, probe `no-vision`, first run). The reader still states text only from
`vision: false`, so Orbweaver never sends the part.

## What each server advertises

| Signal | Ollama | llama.cpp server | KoboldCpp |
| - | - | - | - |
| per-model capabilities | `POST /api/show` → `capabilities: ["completion","tools"]`, `["completion","vision"]`, `["embedding"]` | `GET /props` → `modalities: {vision, video, audio}`, `chat_template_caps: {supports_tools, supports_tool_calls, supports_parallel_tool_calls, …}` (per process: one model) | `GET /api/extra/version` → `vision`, `audio`, `embeddings`, `jinja` (per process: one text model) |
| version | `GET /api/version` → `{"version":"0.35.1"}` | `/props` → `build_info: "b11347-5fc4f3c8c"` | `/api/extra/version` → `version: "1.122.1"` |
| window | Modelfile `num_ctx` in `parameters`, else `GET /api/ps` `context_length` when loaded; otherwise unstated | `/v1/models` row `meta.n_ctx` (the slot), `/props` `default_generation_settings.n_ctx` | `/props` `n_ctx` |
| embedder width | `model_info.<arch>.embedding_length` (every architecture has one — a chat model's is its hidden width, so it counts only when `capabilities` lacks `completion`) | `/v1/models` row `meta.n_embd` | not advertised |
| kind | `capabilities` has `embedding` | not advertised | not advertised (`embeddings: true` names a separate loaded embedder with no row) |
| structured output | not advertised per model; shipped in 0.5.0 (release notes: "Structured outputs … together with Ollama's OpenAI-compatible API endpoints") | not advertised per model; shipped with PR #5978 (merge commit `5b7b0ac8`, 2024-03-21, `response_format` schema → grammar); the merge falls between tags b2460 and b2480, so the floor is b2480 | not advertised per model; release notes 1.90: "Added support for OpenAI Structured Outputs in chat completions API" |
| router mode | n/a | `/props` answers `role: "router"` with no model facts; `/v1/models` rows carry `architecture.input_modalities` and `status` | `/v1/models` lists the admin dir; untested here |

## Ollama context window through `/v1/chat/completions` (`ollama-ctx`)

Prompt: "The secret word is PINEAPPLE" first, ~6300 tokens of filler, then "What is the secret word?".
Server default window as pulled (no `OLLAMA_CONTEXT_LENGTH`, no Modelfile `num_ctx` on `qwen2.5:0.5b`).

| Request | prompt tokens evaluated | recalled the fact |
| - | - | - |
| `/v1/chat/completions`, no knob | 2050 | no ("weather") |
| `/api/chat`, no `options` | 2050 | no |
| `/api/chat`, `options.num_ctx: 16384` | 6313 | yes |
| `/v1/chat/completions` with top-level `num_ctx: 16384` | 2050 | no (ignored) |
| `/v1/chat/completions` with `options: {num_ctx: 16384}` | 2050 | no (ignored) |
| `/v1/chat/completions` against a copy made with `POST /api/create` `parameters: {num_ctx: 16384}` | 6313 | yes |
| server restarted with `OLLAMA_CONTEXT_LENGTH=16384`: `/v1/chat/completions`, no knob | 6313 | yes |
| same server: `/api/chat`, no `options` | 6313 | yes |

Rows: `results/ollama.jsonl`, `kind: "ctx"` (the second block is the `LOCAL_RIG_OLLAMA_CTX=16384` run).

Finding: Ollama's OpenAI-compatible endpoint takes no per-request window knob; the native `/api/chat` honours
`options.num_ctx`. Two server-side settings raise the window for `/v1` too: `OLLAMA_CONTEXT_LENGTH` on the
server, or a Modelfile pin (`ollama create` / `POST /api/create` with `parameters.num_ctx`).

The default on this box is 4096, not 2048. `/api/ps` reports `context_length: 4096` for a runner `/v1` loaded,
and a single user message swept from 1253 to 4053 prompt tokens was evaluated whole with the fact recalled. The
2050 above is what Ollama keeps of one message longer than the window: its tail. On a chat it keeps the system
prompt and drops the oldest messages that do not fit. `/api/ps` also reports whatever window the client that
loaded the runner asked for: after `/api/chat` with `options.num_ctx: 8192` it read 8192, and the next `/v1`
request reloaded the runner at 4096.

Community providers for a native wire, as of the run: `ai-sdk-ollama` 4.4.0 (peer `ai ^7.0.103`) and
`ollama-ai-provider-v2` 4.0.1; neither is adopted.

What the reader does with it (`withOllamaInfo` in `packages/inference/src/catalog/endpoint.ts`): a Modelfile
`num_ctx` is the stated window. Otherwise the row carries `contextFloor`, the lowest default the version can run:
4096 from 0.15.5 (the release that picks the default from VRAM, lowest tier 4096), 2048 before it or with no
version, lowered by a smaller loaded runner and never raised by one. The capability assumes the floor and marks
it, so the editor shows "4,096 tokens (assumed)".

## Ollama window on the native route (D296)

The built-in Ollama row now sends chat to `/api/chat` with the resolved window as `options.num_ctx`
(`packages/inference/src/backends/openai-compat/ollama-native.ts`), so a declared window is the window the
server runs. The same probe, same server default (4096):

| Arm | Window shown | Sent | Evaluated | Recalled |
| - | - | - | - | - |
| no declaration | 4096, assumed | 3592 | 3592 | yes |
| 8192 declared, native route | 8192 | 6975 | 6975 | yes |
| 8192 declared, `nativeChat: none` (`/v1`, the control) | 8192 | 6975 | 4089 | no |
| copy pinned with `num_ctx 8192` | 8192, reported | 6975 | 6975 | yes |

The tables below were measured on `/v1`, before the native route.

## Ollama window through the app's own path (`ollama-window.ts`)

The real resolve (the capability the editor shows) and the real turn pipeline (assembly, the history fit
against that window, the openai-compat backend) against the `ollama` arm, `qwen2.5:0.5b`. The history is
longer than every window. The fact rides the oldest history message the fit keeps, so the server dropping
anything the fit kept loses it. "Sent" is the request counted whole through `/api/chat` at 32768; "evaluated"
is what `/v1` reported.

| Arm | Window shown | Sent | Evaluated | Recalled |
| - | - | - | - | - |
| no declaration (server default 4096) | 4096, assumed | 3592 | 3592 | yes |
| window declared at the old 8192 floor (server default 4096) | 8192 | 6975 | 4089 | no |
| copy pinned with `num_ctx 8192` | 8192, reported | 6975 | 6975 | yes |
| server started with `OLLAMA_CONTEXT_LENGTH=8192`, no declaration | 4096, assumed | 3592 | 3592 | yes |
| same server, window declared at 8192 | 8192 | 6975 | 6975 | no |

Rows: `results/ollama-window.jsonl`. The token counts are the proof. Recall from a 0.5B model is noisy near 7000 tokens: with the whole request evaluated, the last row still answered with filler. The server-setting rows show the assumed floor understates a raised default, which is why the guidance pairs `OLLAMA_CONTEXT_LENGTH` with a declared window.

A digit-dense history ("Note 105.0: …" on every line) sent 4176 tokens against the stated 4096 in an earlier
run of the same probe: the history fit's estimate undercounts that text, and Ollama dropped the oldest kept
message. Plain prose stays inside the window.
