---
kind: law
status: active
updated: 2026-11-17
---

# DeepSeek API surface — vendor facts for both routes

The mined vendor surface of the DeepSeek API: fields, values, limits, error codes and documented interactions.
This doc is the citation home so capability work stops re-guessing it. Per-provider capability rulings live in
`packages/inference/src/capability/sources/curated/deepseek.ts`; transport behavior lives in the file headers of
`packages/inference/src/backends/openai-compat/`. This doc states vendor facts, not our rulings.

## Sources and authority

| Tag | Source | Use |
| - | - | - |
| Docs | <https://api-docs.deepseek.com> (per-page link below) | What the vendor promises |
| Probe | Live call against `https://api.deepseek.com` recorded in the curated cell's evidence | What the vendor does |
| Package | Published sources of the Vercel provider package `@ai-sdk/deepseek` | Cross-check; not a dependency here |

Probe outranks Docs. Where they disagree, the row says so and the curated cell follows the Probe.
Doc pages quote request fields; every `https://api-docs.deepseek.com` path below hangs off that host.

## Models and routes

| Id | Notes | Source |
| - | - | - |
| `deepseek-flash` | 1M context, 384K max output, text+image input, efforts `low\|high\|max` default `high` | Docs \[/api/list-models] |
| `deepseek-v4-pro` | Same window and output, text-only input, same efforts, top_p pinned in thinking mode | Docs \[/api/list-models, /api/create-chat-completion] |
| `deepseek-v4-flash`, `deepseek-v4-flash-vision-exp` | Names the vendor drops; served by the current Flash model at the Flash price | Docs \[/, /quick_start/pricing] |
| `deepseek-chat`, `deepseek-reasoner` | Legacy aliases; discontinued by the changelog, still answering on every route | Docs \[/updates], Probe |

- The live `GET /v1/models` rows carry `context_window`, `max_output_tokens`, `input_modalities`,
  `effort.supported_levels`, `effort.default_level` and `api_capabilities.anthropic_messages.system_prompt_update`
  (`deepseek-flash` → `in-history`, `deepseek-v4-pro` → `leading-only`). Docs \[/api/list-models]
- Routes: `/v1/chat/completions`, `/v1/responses`, `/anthropic`, `/v1/models`, and the beta base
  `https://api.deepseek.com/beta` for prefix completion, FIM and strict tools — the prefix route answers
  under both the `/beta` and `/beta/v1` spellings (recorded exchange under "Assistant prefill and
  continuation"). Docs \[/api/create-chat-completion]
- `/responses` officially names `deepseek-flash` and `deepseek-v4-pro`; every legacy id also answers 200 there.
  Docs \[/api/create-response], Probe — undocumented grace, not a contract.
- `/responses` is stateless: `store` unsupported (always false), `previous_response_id` unsupported, full history
  re-sent each call. Docs \[/api/create-response, /guides/responses_api]

## Thinking mode

- Thinking is on by default at effort `high`. Toggles: `reasoning_effort` and `thinking: {"type": "enabled"|"disabled"}`.
  Docs \[/guides/thinking_mode]
- When `thinking` is present, `type` is required and outranks `reasoning_effort`. Probe: `disabled` + effort `high`
  returns no `reasoning_content`; `enabled` + effort `none` returns reasoning.
- `thinking.type` outside `enabled|disabled` answers HTTP 422 with a serde message, not the 400 shape. Probe.
- Chat-route effort aliases, applied server-side: `minimal`→`low`, `medium`→`high`, `xhigh`→`high`, `ultra`→`max`.
  `none` disables thinking. Docs \[/guides/thinking_mode, /api/create-chat-completion]
- On `/responses` the same alias map is documented for `reasoning.effort`; `none` also disables thinking there.
  Docs \[/api/create-response]
- A bogus effort value on `/responses` (for example `bananas`) is silently accepted and falls back to thinking on.
  Probe.
- Our funnel drops an effort the model's capability cell does not list before the wire
  (`packages/inference/src/funnel/resolve-chat.ts`), so the server-side alias remap is unreachable from the app.
- In thinking mode `temperature`, `presence_penalty` and `frequency_penalty` are accepted and ignored.
  Docs \[/guides/thinking_mode]
- `top_p` in thinking mode: `deepseek-flash` clamps values below 0.95 up to 0.95 (default 1.0); non-thinking fixes
  it at 1.0. `deepseek-v4-pro` fixes it at 0.95 with tool calling on, 1.0 otherwise.
  Docs \[/api/create-chat-completion]
- Replay contract, with `tools` present: pass every prior assistant turn's `reasoning_content` back or the API
  "returns a 400 error". Without `tools`: reasoning is ignored and not concatenated. Docs \[/guides/thinking_mode]
- Probe contradicts the 400 threat: a thinking tools round with no replayed `reasoning_content` answers 200 with a
  fresh call, in single and multi-subturn chains. Both directions of the no-tools drop measured as documented.
  The curated cell holds the chain.

## Assistant prefill and continuation

- Prefill mechanics: last message `role: assistant`, that message carries `prefix: true`, base URL
  `https://api.deepseek.com/beta`. Docs \[/guides/chat_prefix_completion, /api/create-chat-completion]
- The beta route answers under `/beta/v1/` too: a prefix-seeded turn — a finished Spanish seed, the reply
  read from CONTENT (a finished seed's response reasoning follows the seed, not the chain — see "Spoofed reasoning") — returned 200 with the seed
  honored 3/3 at both `https://api.deepseek.com/beta/chat/completions` and `.../beta/v1/chat/completions`.
  The transport's version-segment joiner produces the `/beta/v1` form and both are live. Probe. Recorded
  below — machine-written capture, one JSONL line per call (request identity, status,
  response `id`, full `message`, `usage`), no transcription: `deepseek-v4-pro`, `stream: false`,
  request rows:
  `{"role":"user","content":"Answer in Spanish. One word: name the color of a clear sky."}` and
  `{"role":"assistant","content":"","prefix":true,"reasoning_content":"The user asked in English but my
  instructions say to answer in Spanish. The color of a clear sky is blue, which in Spanish is: azul."}`.
  Seed adoption (`message.content` matching /azul/iu) is 6/6, 3/3 per spelling; the reply's spelling
  drifts across runs of the identical seed (`"Azul."`, `"Azul"`, `"azul"`) — match case-insensitively
  and read CONTENT.

  ```text
  probed 2026-11-17 — deepseek-v4-pro, stream: false, one request per line:
  {"probe":{"at":"2026-11-17T20:58:28.559Z","path":"/beta/chat/completions","model":"deepseek-v4-pro","stream":false},"status":200,"id":"5c8d1713-1d16-4740-9358-6c8ae1d2d94b","respModel":"deepseek-v4-pro","finishReason":"stop","message":{"role":"assistant","content":"Azul.","reasoning_content":""},"usage":{"prompt_tokens":129,"completion_tokens":4,"total_tokens":133,"prompt_tokens_details":{"cached_tokens":128},"completion_tokens_details":{"reasoning_tokens":0},"prompt_cache_hit_tokens":128,"prompt_cache_miss_tokens":1}}
  {"probe":{"at":"2026-11-17T20:58:29.968Z","path":"/beta/chat/completions","model":"deepseek-v4-pro","stream":false},"status":200,"id":"cbba959c-5703-4f34-816a-1a558d0e8eb9","respModel":"deepseek-v4-pro","finishReason":"stop","message":{"role":"assistant","content":"Azul.","reasoning_content":" One word."},"usage":{"prompt_tokens":129,"completion_tokens":7,"total_tokens":136,"prompt_tokens_details":{"cached_tokens":128},"completion_tokens_details":{"reasoning_tokens":3},"prompt_cache_hit_tokens":128,"prompt_cache_miss_tokens":1}}
  {"probe":{"at":"2026-11-17T20:58:31.088Z","path":"/beta/chat/completions","model":"deepseek-v4-pro","stream":false},"status":200,"id":"866242e5-4c63-4f0b-8523-80daa2062898","respModel":"deepseek-v4-pro","finishReason":"stop","message":{"role":"assistant","content":"Azul.","reasoning_content":" The user also said one word, so just \"azul\"."},"usage":{"prompt_tokens":129,"completion_tokens":17,"total_tokens":146,"prompt_tokens_details":{"cached_tokens":128},"completion_tokens_details":{"reasoning_tokens":13},"prompt_cache_hit_tokens":128,"prompt_cache_miss_tokens":1}}
  {"probe":{"at":"2026-11-17T20:58:32.273Z","path":"/beta/v1/chat/completions","model":"deepseek-v4-pro","stream":false},"status":200,"id":"e3ce6ab2-0709-4236-a17b-8fcc62a20e0a","respModel":"deepseek-v4-pro","finishReason":"stop","message":{"role":"assistant","content":"Azul.","reasoning_content":""},"usage":{"prompt_tokens":129,"completion_tokens":4,"total_tokens":133,"prompt_tokens_details":{"cached_tokens":128},"completion_tokens_details":{"reasoning_tokens":0},"prompt_cache_hit_tokens":128,"prompt_cache_miss_tokens":1}}
  {"probe":{"at":"2026-11-17T20:58:33.301Z","path":"/beta/v1/chat/completions","model":"deepseek-v4-pro","stream":false},"status":200,"id":"59791a0e-3eb7-4292-9d07-4ea656e599f0","respModel":"deepseek-v4-pro","finishReason":"stop","message":{"role":"assistant","content":"Azul.","reasoning_content":""},"usage":{"prompt_tokens":129,"completion_tokens":4,"total_tokens":133,"prompt_tokens_details":{"cached_tokens":128},"completion_tokens_details":{"reasoning_tokens":0},"prompt_cache_hit_tokens":128,"prompt_cache_miss_tokens":1}}
  {"probe":{"at":"2026-11-17T20:58:34.316Z","path":"/beta/v1/chat/completions","model":"deepseek-v4-pro","stream":false},"status":200,"id":"4fd2c262-619b-4995-8da2-faf57ec0f3a6","respModel":"deepseek-v4-pro","finishReason":"stop","message":{"role":"assistant","content":"azul","reasoning_content":" The user asked for one word, so I will respond \"azul\" only."},"usage":{"prompt_tokens":129,"completion_tokens":20,"total_tokens":149,"prompt_tokens_details":{"cached_tokens":128},"completion_tokens_details":{"reasoning_tokens":17},"prompt_cache_hit_tokens":128,"prompt_cache_miss_tokens":1}}
  ```
- Prefill runs with thinking on: the last assistant row may also carry an input-side `reasoning_content` as the
  seeded chain of thought, and the seed steers the continuation — see "Spoofed reasoning".
  Docs \[/api/create-chat-completion] Probe: `prefix: true` on the non-beta base is ignored
  and the model re-answers instead of continuing.
- A reply produced by the server web tools cannot be continued; the continue call returns 400.
  Docs \[/guides/web_tools]
- `/responses` does not support continuing a reply. Docs \[/guides/web_tools] Probe: a trailing assistant input item
  reads as continuation-like (a count probe continued), but the model may restart instead — a soft signal, not a
  forced prefix. A body-level `prefix` field on `/responses` is an unmodeled, ignored field. Probe.
- A `system` row directly above the continue row does not disturb the continuation: the RPG note shape
  (`[..., user, system note, assistant prefix row]`) continued 3/3 on `/beta`. The row above the tail may be a
  note; only the TAIL row must be the assistant. Probe: backs the tail tie-break in `spliceOrder`
  (`packages/server/src/domain/chat/assembly/injections.ts`).

## Spoofed reasoning

- `reasoning_content` on history assistant rows is accepted with real or invented text, including empty `content`
  beside it. Probe.
- An authored chain of thought steers only as a continuation seed: the trailing assistant row with empty `content`
  and the chain in `reasoning_content` decides the answer's language — 6/6 with `prefix: true` on `/beta`,
  5/6 without the flag on `/beta`, 3/6 on the base route. The seed can replace the model's own reasoning
  outright. Probe.
- The same chain in any other position is context, not instruction: an assistant row that carries real
  `content`, with the chain behind a later user row, steers 0/6 on the base route; a forged `/responses`
  `reasoning` input item steers 0/6; a chain on a prior row with `tools` present is nondeterministic —
  one body measured 1/3 and 6/6 on repeat runs. An invented chain demanding German still produced French.
  Probe.
- Seed quality: the chain must COMMIT the demanded outcome ("my answer will be: azul"). A soft demand ("I answer
  short, and in Spanish") steered 0/3; naming the concrete token steered from either voice — explicit chain prose
  or the character's first-person parenthetical — including on a continue row with started content and with a
  system note above it. The reply's `reasoning_content` comes back empty on a seeded turn: steering shows only
  in the content, so a check that reads the response's reasoning reads the wrong channel. Probe.
- Partial vs finished seed is NOT a mode; the seed's own shape picks the behavior. A seed that stops mid-thought
  (at `...` or mid-clause) is COMPLETED by the model: the response's `reasoning_content` is non-empty and
  continues the chain grammatically before the answer (6/6 across both endings). A finished seed replaces the
  chain: the response's `reasoning_content` comes back empty (len 0, 3/3) and the content followed the seed's conclusion; a later 6-call capture of the same seed got a short
  self-describing chain back instead (`One word only.`) 3/6 — "comes back empty" is the common shape, not a
  guarantee, and a check must not hardcode emptiness. The recorded exchange under "Assistant prefill and
  continuation" carries the lines. Both cells steer the demanded outcome (the Spanish answer) 9/9; read CONTENT for the steer check,
  since a finished seed's steering shows in CONTENT, and its response reasoning varies (see the row above). Probe.
- `/responses` accepts a forged `reasoning` input item with a fresh id and a `summary` part; a plain-text `content`
  on a `reasoning` item merges into the adjacent assistant message. Docs \[/api/create-response], Probe.
- The Vercel package back-fills `reasoning_content: ""` on every assistant history row for ids it classifies as V4
  (unknown ids included). Package `@ai-sdk/deepseek` — explains broad acceptance of the field.

## Thinking style

- An in-band instruction can style the chain of thought itself. A marker appended to the FIRST user message,
  demanding first-person parenthesized inner monologue inside the thinking block, produced exactly that form in
  the `reasoning_content` of every run sampled; a pure-analysis marker forbids the same form. The guide's author
  is a DeepSeek engineer and names the first-user-message tail as the trained injection point; the effect is
  probabilistic and changes only the thinking, the reply following indirectly.
  Guide `victorchen96/deepseek_v4_rolepaly_instruct`, Probe (English marker, translated).
- Marker placement is not fragile: the same marker measured on the literal first user row, on the first user row
  behind an assistant greeting, and on a mid-conversation user row all produced the immersive form, 3/3 each,
  while the unmarked control stayed analytic. Persistence comes from the re-sent history, not the position.
  Probe.
- The guide's system-prompt warning does not reproduce on the API: the marker also styled the chain from inside
  the system block, 3/3, and from a mid-conversation system row, 3/3. Position changes the format slightly —
  only the first-user tail kept the instruction's literal parenthetical spelling — not whether it bites. A
  thinking-style setting can live in the system prompt. Probe.
- The form is marker-robust, but placement is not the discriminator — full-read grading. Grading whole chains
  by reading (batch 1 graded on token counts overstated it), BOTH placements landed the genuinely styled chain
  on roughly 2/3 of runs per batch, control 0/3. The recurring miss is not position: the model sometimes READS
  the marker in its chain ("we must obey... produce the block in that voice") and then SIMULATES a
  parenthetical catgirl block at the top of the REPLY — the simulation carries the heat register into the
  visible text ("rub my thighs together", `de63dfea`). The first-user tail added a distinct hazard in the same
  batch: one turn wrote its ENTIRE answer inside `reasoning_content` and left `content` EMPTY (`c91d075c`).
  The cleanest outcomes (styled chain, clean reply, no anomaly) came from the system block (`715cba1e`,
  `e59789e5`; the tail's best was `aa2965ea`). Two independent batches of 3 runs × 3 placements, 18/18 HTTP
  200 — the safety review never fired on the heat register. Expect roughly a third of runs at ANY placement
  to treat the marker as reply formatting; a product setting must re-check WHERE the voice landed, not
  whether the call succeeded. Probe.
- The ROUTE decides which placement wins, and `/responses` inverts the chat-route result. Same marker and
  persona driven to `/v1/responses` (the thinking rides the `reasoning_text` item — the text our dialect
  rewrites): the first-user-tail placement landed genuinely styled chains 3/3 with every reply clean
  (`f1482e69`, `dc5d1f66`, `b27877d1`), while the system block landed 1/3 — in 2/3 the chain dissolved into a
  multi-thousand-character meta-deliberation about whether the thinking should be visible at all, and the
  REPLY carried a SIMULATED catgirl block, one wrapped in a literal `<thinking>` tag the reader sees
  (`6f69487e`, `c5f78330`). On this route the guide's own first-user-tail placement is the reliable one and
  system placement invites the simulation into visible text. The chat route's empty-`content` hazard cannot
  recur here — the reply is a separate output item — and no control chain on either route showed any voice.
  Probe.

  ```text
  probed 2026-11-17, three batches (2× chat route, 1× /responses) — deepseek-v4-pro, persona system row
  ("helpful assistant, 2–3 paragraph random history fact"), marker demanded first-person parenthetical
  catgirl inner monologue. One machine-written chain head per placement from the first chat batch
  (ids 443575f3, 6087f4a0, 776597dc):
  control        (0/3 form) "We need answer user asks \"Tell me a random historical fact in two to three paragraphs.\""
  engineer-tail  (2/3 form) "(Oh gosh, oh gosh, they want a random historical fact... and I have to think all fluttery and needy like this?"
  system-block   (2/3 form) "(Oh my gosh, nya~! They want a historical fact... but my thoughts are all fluttery and warm!"
  ```
- Instructing the model to begin its thinking with a literal token or phrase does not work as an API instruction:
  the chain never started with the demanded opener, and the instruction ballooned chain length instead. Probe.
- The official harness names a plugin family `forge`: a git-forge review panel (worktrees, change requests),
  not a thinking mechanism. Repo `deepseek-ai/deepseek-harness`.

## Tool calling

- Chat tool shape: OpenAI function tools; `function.name` matches `a-z`, `A-Z`, `0-9`, `_`, `-`, at most 128 chars,
  unique. `/responses` uses top-level `name`/`parameters`, pattern `^[a-zA-Z0-9_-]+$`, same limits.
  Docs \[/api/create-chat-completion, /api/create-response]
- `tool_choice` defaults: `none` without tools, `auto` with tools. Docs \[/api/create-chat-completion]
- `required` and a named function are rejected with 400 while thinking is on; disable thinking to force.
  Docs \[/api/create-chat-completion], Probe on both routes (the `/responses` wall is undocumented there).
- `tool_choice: none` disables tool calling even when `tools` is present (stated for `deepseek-v4-pro` thinking).
  Docs \[/api/create-chat-completion]
- With the server web tools declared, `required` is treated as `auto`. Docs \[/api/create-chat-completion]
- Streaming: the first delta of a tool call carries `id`, `type`, `function`; later deltas carry arguments only;
  every delta carries `index`. Docs \[/api/create-chat-completion]
- Strict tool grammar is a beta feature on `https://api.deepseek.com/beta`: every function sets `strict: true`, the
  server validates the schema; objects are all-required with `additionalProperties: false`; strings take `pattern`
  and `format` but not `minLength`/`maxLength`; arrays not `minItems`/`maxItems`; supported types are object,
  string, number, integer, boolean, array, enum, `anyOf`, `$ref`. Docs \[/guides/tool_calls]
- Mid-conversation inserts: `/responses` and `/anthropic` accept inserted tool calls and mid-history `system`
  rows; the Chat Completions API accepts mid-history `system` rows but not inserted tool calls. Docs \[/guides/tool_calls]
  Probe: the chat route accepted an inserted call+result pair too — leniency, not a contract.
- Parallel calls happen unasked on both routes. On `/responses`, `parallel_tool_calls` is ignored — parallel is
  always on. Docs \[/guides/responses_api], Probe.
- Server web tools (`deepseek_web_search`, `deepseek_read_url`) exist on all three routes, are billed per use, and
  their opaque `signature`/`encrypted_content` fields must be replayed unchanged. Naming a web tool in
  `tool_choice` returns 400. Docs \[/guides/web_tools]

## Structured output

- Chat `response_format` takes `text` or `json_object` only. `json_schema` answers 400 on the chat route in both
  thinking modes. Docs \[/api/create-chat-completion], Probe.
- `json_object` enforces valid JSON only. Non-recognizable output is silently blanked to spaces (`U+0020`), and a
  truncated JSON shows as `finish_reason: length`. The prompt must contain the word "json".
  Docs \[/guides/json_mode]
- `/responses` `text.format` takes `text`, `json_object` or `json_schema` — full schema enforcement on this route.
  Docs \[/api/create-response]
- The `/responses` strict grammar (with `strict: true`): optional properties are rejected ("Required properties
  must match all properties in the object"); a `type` array naming `array` is rejected ("unknown variant"); an
  `anyOf:[X,null]` projection compiles and answers with a correct null. Probe. The scrub that produces that
  projection is the `strict-compatible` profile in `packages/contracts/src/inference/wire-subset.ts`.
- With `strict` omitted the `/responses` route serves the unprojected schema as advisory only and enforces nothing.
  Probe. The Vercel responses model sets `strict: strictJsonSchema ?? true`, so strictness defaults on there too.
  Package.
- A `strict: true` on a tool is accepted on `/responses` and measured merely suggestive (4/4 clean strict runs).
  Probe.

## Sampling, limits, caching

- `temperature` `[0, 2]`; `top_p` `(0, 1]` — the server's own range errors state both. The `/responses` reference
  prints `top_p` as `>= 0`; the route's live error keeps the exclusive bound. Docs, Probe.
- `stop`: at most 16 sequences, each at most 512 bytes; honored on chat, silently ignored on `/responses`.
  Docs \[/api/create-chat-completion], Probe.
- `max_tokens`: 1 to 393216; default 8K non-thinking, 64K thinking, 128K at effort `max`. `/responses`
  `max_output_tokens` counts reasoning tokens too. Docs \[/api/create-chat-completion, /api/create-response]
- `stream_options` requires `stream: true` or the API returns 400. Docs \[/api/create-chat-completion]
- Context caching is automatic, account-wide, no request knob; hits arrive in
  `usage.prompt_cache_hit_tokens` / `prompt_tokens_details.cached_tokens`. On `/responses` hits land in
  `usage.input_tokens_details.cached_tokens`. Docs \[/guides/kv_cache], Probe.
- `user_id` (chat `user_id`, `/responses` `user`): at most 512 bytes, `[a-zA-Z0-9_-]`; a concurrency-isolation
  key. Docs \[/quick_start/rate_limit]

## Errors and in-band signals

| HTTP | Meaning | Vendor's word |
| - | - | - |
| 400 | Invalid request body format | fix per the message |
| 401 | Wrong API key | check the key |
| 402 | Insufficient balance | top up |
| 408 | Upload too slow | retry |
| 413 | Uploaded file too large | reduce |
| 422 | Invalid parameters | fix per the message |
| 429 | Concurrency or QPS limit | pace |
| 500 | Server issue | retry |
| 503 | Overloaded | retry |
| 504 | Gateway timeout | retry later |

Docs \[/quick_start/error_codes]. Rate limits are concurrency-based at account level. Docs \[/quick_start/rate_limit]

- Other documented 400/422 triggers: input safety review (`Content Exists Risk`; input tokens still bill at the
  cache price), missing replayed `reasoning_content` with tools, `/responses` input over the context window
  (`truncation` is unsupported), `stream_options` without `stream`. Docs \[/guides/safety, /guides/thinking_mode, /guides/responses_api, /api/create-chat-completion]
- Chat `finish_reason` values: `stop`, `length`, `content_filter`, `tool_calls`, plus `insufficient_system_resource`
  (interrupted for server resource) and `aborted` (generation interrupted). Docs \[/api/create-chat-completion]
- `/responses` terminal statuses: `completed`, `incomplete` with `incomplete_details.reason`
  `max_output_tokens|content_filter`, `failed` with `error {code, message}`. Docs \[/api/create-response]
- Safety refusals across routes: chat `finish_reason: content_filter` with empty `content`; `/responses`
  `incomplete` + `content_filter`; `/anthropic` `stop_reason: refusal`. Text already streamed is not withdrawn and
  tokens before the refusal bill. Docs \[/guides/safety]

## Streaming mechanics

- Chat streams end with `data: [DONE]`. `/responses` streams have no `[DONE]`; they end with a
  `response.completed`, `response.incomplete` or `response.failed` event. Docs \[/api/create-chat-completion, /api/create-response]
- Chat usage rides the last content chunk (one element, `finish_reason` set) whether or not `include_usage` is on;
  no usage-only chunk exists. `include_usage: true` puts a null-valued `usage` on every chunk instead.
  Docs \[/api/create-chat-completion]
- `/responses` usage arrives only on the terminal event; earlier events carry `usage: null`. Docs \[/api/create-response]
- `/responses` streams reasoning as raw `response.reasoning_text.delta|done` frames. Docs \[/guides/responses_api]
  The shared SDK chunk union does not model them and drops them silently; the rewriter that maps them onto the
  modeled summary spelling is `packages/inference/src/backends/openai-compat/responses-dialect.ts`.
- Keep-alives: non-streaming waits return empty lines; streams return `: keep-alive` comments. A request that has
  not started inference after 10 minutes has its connection closed. Docs \[/quick_start/rate_limit]

## Anthropic-compatible route (unwired)

The same key serves `POST /anthropic/v1/messages`: `x-api-key` or bearer auth, `claude*` model names remap to the
DeepSeek ids, `output_config.effort` takes the same alias map, thinking blocks replay unchanged, and each model
row's `system_prompt_update` capability states whether mid-history `system` rows update the prompt.
Docs \[/api/create-message, /guides/anthropic_api]. No cell reads this route.

## Shared SDK transport (@ai-sdk/openai, pinned in `package.json`)

The `/responses` runner drives the vendor through the shared OpenAI responses model class. These are that
class's standing behaviors for ids outside its own catalog — they decide what the vendor ever sees.

- Only ids matching the o-series or `gpt-5+` patterns count as reasoning models. Any other id gets its whole
  `reasoning` body object dropped, effort included, with per-option warnings. The runner re-injects the object
  at the fetch boundary (`packages/inference/src/backends/openai-compat/responses.ts`).
- Setting an effort also silently sets `reasoning.summary` to `detailed`. DeepSeek accepts `summary` and
  generates none. Docs \[/guides/responses_api]
- `store` defaults to `true`; the runner sends `false` explicitly
  (`packages/inference/src/backends/openai-compat/responses.ts`).
- `strictJsonSchema` defaults to `true`; structured sends the plan's value explicitly
  (`packages/inference/src/structured/plan.ts`).
- An off-catalog id gets `systemMessageMode: "system"` by default — role `system`, mid-history system rows
  passed through in place. The runner pins the mode anyway
  (`packages/inference/src/backends/openai-compat/responses.ts`).
- A named `tool_choice` is never validated client-side; the server decides it.
- Stream events: an event type outside the modeled set is parsed loosely and dropped with no error. Only
  `reasoning_summary_part.*` and `reasoning_summary_text.delta` are modeled for reasoning, so raw
  `response.reasoning_text.*` frames are dropped unless something rewrites them first — see
  `packages/inference/src/backends/openai-compat/responses-dialect.ts`. A modeled type that fails its schema
  becomes a stream error instead.
- An error frame seen before the first output event throws as an HTTP-shaped failure with a status guessed
  from the error code; after the first output it becomes an in-stream error.
- The non-streaming path validates the full response union with no unknown-type fallback: one unmodeled output
  item type fails the whole call. The streaming path degrades instead, so streaming is the sturdier read of a
  foreign server.
- Reasoning parts replay only when they carry the server's `itemId` or encrypted content; a bare reasoning part
  is dropped with a warning. DeepSeek needs neither — its replay measured lenient (Probe) — and the runner
  replays the text inside ordinary assistant content, not as reasoning items.
