---
kind: review
status: active
updated: 2026-09-19
---

# `@orb/inference` × Vercel AI SDK — integration audit (fix ledger)

## Outcome

The cut-over to the AI SDK provider layer (`ai@7.0.107`, provider spec V4, `@ai-sdk/anthropic@4.0.58`,
`@ai-sdk/openai-compatible@3.0.53`, `@openrouter/ai-sdk-provider@3.0.0`) is structurally sound and matches
`docs/design/orbweaver-inference-package.md` §8.0 (provider layer only, `ai` core never taken). Every SDK
option the package spells was verified against the installed dist. The defects below are what an owner-grade
pass found; each row carries its receipt, the fix shape, and a severity. The tree audited is the UNCOMMITTED
`packages/inference/` on `main` at `75e72d926` plus the vendored docs at `docs/vendor/ai-sdk/` (fetched the
same day from the `ai@7.0.107` tag). Severity: **P1** wrong output or a live 400 · **P2** a recorded lie or a
swallowed signal · **P3** a capability the SDK exposes that the package leaves on the floor · **P4** hygiene.

## A. Correctness — fix before launch

| # | Sev | Finding | Receipt | Fix |
| - | - | - | - | - |
| A1 | P1 | **Reasoning is never replayed; thinking + tool loops 400 on both Anthropic paths.** The send model has no `reasoning` content part; the reducer keeps only reasoning TEXT and drops `providerMetadata` on `reasoning-delta`/`reasoning-end` (where the Anthropic provider emits the thinking `signature`, and OR emits `reasoning_details`). Both converters only emit a `thinking` block back when the replayed part carries the signature. | `packages/contracts/src/chat/bus.ts:39`; `backends/v4/stream.ts:72-74`; anthropic dist `index.js:3091-3119` (signature required), `:5639-5647` (signature emitted on `reasoning-delta`); OR dist `index.js:3169` (`providerOptions.openrouter.reasoning_details`), `:3189` (unsigned entries stripped) | Add a `reasoning` part to `ChatContentPart` carrying opaque per-wire metadata (`{ text, meta: { anthropic?: { signature \| redactedData }, openrouter?: { reasoning_details } } }`); the reducer accumulates per-part metadata keyed by `id`; `prompt.ts` emits `{ type:"reasoning", text, providerOptions }` on assistant rows; persist it on the variant beside `reasoning`. Pin: a two-leg tool loop with thinking on against a wire capture. |
| A2 | P1 | **Anthropic direct wire has no prefill-vs-thinking guard.** A history ending on an assistant row is forwarded as prefill (the SDK only trims trailing whitespace); Anthropic rejects prefill when extended thinking is enabled. The vLLM path emits `reasoning_dropped_for_prefill`; the anthropic wire never reads `plan.endsOnAssistant`. | anthropic dist `index.js:3079-3081`; `backends/anthropic-messages/chat.ts` (no `endsOnAssistant`/`prefill` reference) | When `plan.endsOnAssistant && knobs.reasoning.enabled`: either drop thinking with `reasoning_dropped_for_prefill` (mirror vLLM) or refuse the prefill with a typed warning — pick per `acceptsAssistantPrefill(generation)`. Pin both arms. |
| A3 | P1 | **SDK `stream-start` warnings are collected and discarded.** `drainStream` accumulates them into `drain.warnings`; `toChatResult` emits only `ctx.warnings`; nothing reads `drain.warnings`. Same for `doGenerate` results in the batch runner. These are the SDK's `unsupported` (frequencyPenalty/presencePenalty/seed on every Anthropic model; temperature/topK/topP on Opus 4.7+/Opus 5/Fable 5/Sonnet 5), `compatibility` (default thinking budget 1024, maxOutputTokens capped for unknown model), and dropped `clearAt`/`toolChanges` on the leading system row. | `backends/v4/result.ts:92`; `backends/v4/stream.ts:88`; `backends/v4/batch.ts` (no `warnings` read); anthropic dist `index.js:3981-3987`, `:4046-4070`, `:5949-5959` | Map `SharedV4Warning` → `ResolvedWarning` (new codes `sdk_unsupported_setting`, `sdk_unsupported_tool`, `sdk_compatibility`) in `result.ts` and the batch runner; feed them into `log.sampling.dropped` and the turn's `warning` events. Every downstream row in section B depends on this. |
| A4 | P2 | **BYOK cost read wrong on OpenRouter.** `measuredCostOf` reads `providerMetadata.openrouter.usage.cost` only; for a BYOK connection that is the OR credits charge, the upstream spend is `usage.costDetails.upstreamInferenceCost`. `costProvenance: measured` is then wrong for BYOK. | `backends/v4/result.ts` `measuredCostOf`; `docs/vendor/ai-sdk/openrouter/README.md:416-449` | Read `costDetails.upstreamInferenceCost` when present, keep `cost` as the OR fee; record both in `costDetails` (`{ totalUsd, promptUsd, completionUsd, upstreamUsd?, gatewayUsd? }`). |
| A5 | P2 | **Anthropic classifier-block details are dropped.** Fable 5 refusals are a `200` with `content-filter` finish and the category on `providerMetadata.anthropic.stopDetails`; `fallbacks` can retry server-side and `providerMetadata.anthropic.iterations` records that a fallback served the turn. The fold maps the finish reason and reads neither. | `docs/vendor/ai-sdk/providers/01-ai-sdk-providers/05-anthropic.md:311-386`; `contract/chat.ts:150-157` | Surface `stopDetails` as a `refusal` event with `category`/`explanation`; expose `fallbacks` as a connection extras key (see C2) and mark `providerMetadata.anthropic.iterations` fallback on the turn. |
| A7 | P2 | **Assistant-image re-attach is dropped on the Anthropic wire with a false premise.** The header says "the SDK exposes no post-convert hook"; the package ALREADY has one — `wrapFetch.shapeBody` is exactly how the openrouter transport re-attaches (the OR provider has no `transformRequestBody` either). The anthropic wire passes `shapeBody: undefined` and warns `image_edit_dropped`. Anthropic's body is `messages[].content[]` blocks; an image block is `{ type:"image", source:{ type:"url" or "base64", … } }`. | `backends/anthropic-messages/chat.ts:4-6,280-285`; `backends/anthropic-messages/model.ts:46-64` (no `shapeBody`); `backends/v4/fetch.ts:41-42,287` | Give the anthropic transport a `shapeBody` that walks `plan.assistantMedia` by wire index and appends Anthropic image blocks (same length guard as `reattachRows`); retire the warning. |
| A6 | P2 | **Structured-output fallback vehicle can 400 on Fable.** `forced-tool` is chosen whenever the capability says not-structured; Fable 5.1 rejects forced tool use and supports native `output_format`. A curated cell that under-declares `structured` on a Fable id sends a request the API rejects. | `roles/role-clients.ts:53`; `05-anthropic.md:200-203` | Curated cells for `claude-fable-*`/`opus-4-7+`/`sonnet-5` carry `structured: true`; add a table pin asserting no Fable id resolves `forced-tool`. |

## B. Recorded lies and unification (the DB must say the same thing on every wire)

| # | Sev | Finding | Receipt | Fix |
| - | - | - | - | - |
| B1 | P2 | **Persisted `reasoningEffort` is the REQUESTED effort, not the applied one.** An openai-compatible row with no `reasoning_effort` field drops effort (warning) yet the variant stores `high`; same on Anthropic when `minimal` drops or a mandatory clamp raises it. | `packages/server/src/domain/chat/engine/engine.ts:1377-1378`; `persistence/canon-write.ts:247`; `funnel/resolve-chat.ts:87,145` | Persist `knobs.reasoning.effort` post-resolution (carry it on `ChatResult`); keep the requested value in `params` (already stored). Pin: openai-compatible row with `features.effort: "none"` stores `reasoning_effort = null`. |
| B2 | P2 | **`log.sampling.applied` is the funnel's output, not the wire's.** The SDK strips a second layer (A3) after `resolveChat`; the receipt claims those knobs applied. Masked today only because the direct Anthropic wire ships NO sampler ranges (fail-closed until a measured entry). | `backends/anthropic-messages/chat.ts:255`; `backends/openai-compat/chat.ts:340`; `capability/sources/curated/anthropic.ts:91` | After A3, subtract SDK-dropped features from `applied` and add them to `dropped`. |
| B3 | P2 | **Same Claude model, two wires, different knobs.** Direct wire drops every sampler knob; the OR Anthropic route takes ranges from the OR catalog and sends temperature to models that reject it (Opus 4.7+/5, Fable 5, Sonnet 5). | anthropic dist `getModelCapabilities` `index.js:5949-5959`; `curated/anthropic.ts:230` | Curated cells for those ids carry `sampling: {}` on BOTH wires (the SDK's table is the receipt); a pin that the resolved sampling for `anthropic/claude-opus-4-7` via OR is empty. |
| B4 | P2 | **`reasoningRedacted` misreports on Opus 4.7+.** Thinking text is omitted by default unless `display: 'summarized'`; the fold flags `reasoning === "" && reasoningTokens > 0` as redacted. | `05-anthropic.md:431-454`; `backends/v4/result.ts` `reasoningRedacted` | Funnel default `display: "summarized"` on adaptive-thinking models that advertise `displayModes` (also fixes the doc's "long pause before output" streaming note); derive `reasoningRedacted` only from an actual `redactedData` part (A1 gives you that). |
| B5 | P3 | **`reasoningTokens` is normalized but never stored.** In `ChatUsage` on every wire; only consumer is `compose/rpg.ts:990`; no variant column. | `packages/contracts/src/inference/usage.ts:28`; `packages/db/src/schema/chat.ts` (no column) | Add `reasoning_tokens` to the variant (forward migration, D163) or drop the field from `ChatUsage`. Don't leave a field nothing keeps. |
| B6 | P3 | **`rateLimit` is hard-coded `null` on both hosted wires.** The V4 `doStream` result exposes `response.headers`; Anthropic (`anthropic-ratelimit-*`) and OR (`x-ratelimit-*`) both send them. `streamOnce` destructures only `{ stream }`. | `backends/v4/result.ts` (`rateLimit: null`); `backends/*/chat.ts` `streamOnce` | Read headers into `rateLimit` and the `rate_limit` bus event; one parser in `backends/kit/`. |
| B7 | P3 | **`generationId` is OR-only.** Anthropic's message id already lands in `drain.responseId`; the anthropic wire passes `generationId: null`. | `backends/anthropic-messages/chat.ts:320` | Store the provider response id on every hosted wire (it is the support handle). |
| B8 | P4 | `costDetails` is computed and never persisted (only `costUsd`). | `usage.ts:32`; `schema/chat.ts` | Persist or drop, same rule as B5. |

## C. Capability left on the floor (SDK exposes it; a product call each, but the door should exist)

| # | Sev | Finding | Receipt | Fix |
| - | - | - | - | - |
| C1 | P3 | **`strict` on function tools is unreachable.** `LanguageModelV4FunctionTool` has `strict?` and `inputExamples?`; `WireTool` has name/description/parameters only. OpenAI strict tool mode is off everywhere; OR `structuredOutputs.strict` covers the response format only. | provider dist `index.d.ts:1009-1019`; `contract/chat.ts:50-54`; `backends/v4/options.ts` `functionTools` | Add `strict?` and `inputExamples?` to `WireTool`; spell them per `features.strictJson`. |
| C2 | P3 | **Anthropic extras are dropped wholesale**, yet `providerOptions.anthropic` models `metadata.userId`, `speed`, `taskBudget`, `inferenceGeo`, `fallbacks`, `contextManagement`, `mcpServers`, `container`, `toolStreaming`. | `backends/anthropic-messages/chat.ts:177-182` | Model an allowlist of anthropic extras keys (the openrouter pattern: `provider`/`models`), validated by zod, dropped loudly otherwise. `metadata.userId` should be plumbed from the principal regardless (abuse attribution the API asks for). |
| C3 | P3 | **OpenRouter `plugins` is hard-coded to context-compression.** 3.0.0 models `web`, `file-parser`, `moderation`, `response-healing`, `auto-router`, plus `web_search_options` and `debug.echo_upstream_body`. `response-healing` is the direct answer to malformed JSON on the non-streaming structured task. | OR dist `index.d.ts:98-165`; `backends/openai-compat/chat.ts:229-232,252` | `plugins` becomes a merged list: compression (turn-owned) + user-declared plugins off `extras.plugins` (validated). `debug` is a connection debug toggle (see D3). |
| C4 | P3 | **Anthropic tool cache breakpoint.** Tools are a large cacheable prefix; no `cacheControl` is placed on the tool list. | `05-anthropic.md:808-830` | When `explicitPromptCache`, set `providerOptions.anthropic.cacheControl` on the LAST tool in `functionTools`; count it in the cache receipt. |
| C5 | P3 | **`toolChanges` (mid-conversation tool add/remove without a cache miss)** and `deferLoading`/tool search are unwired. | `05-anthropic.md:1221-1436` | Only if the engine changes the tool set per turn; otherwise record as a wake condition. |
| C6 | P3 | **Anthropic context management** (`clear_thinking`, `clear_tool_uses`, server-side `compact_20260112`). Own compaction exists (`chat/verbs/compaction.ts`), so this is a fork; `clear_thinking keep:N` is the cheap long-tool-loop fix once A1 lands. | `05-anthropic.md:545-734` | Owner fork: expose `contextManagement` via C2 or keep the house compaction only. Default: expose, off. |
| C7 | P3 | **Anthropic Message Batches** for `summarize`/`structured`. The batch runner is one `doGenerate` per item; the SDK's experimental batch API rides the real Batches endpoint (half price, per-request models/tools). `ai`-core, experimental. | `backends/v4/batch.ts:1,118`; `docs/vendor/ai-sdk/docs/03-ai-sdk-core/42-batch.md` | Owner fork on volume; pin the experimental import if taken. |
| C8 | P4 | `metadataExtractor` on openai-compatible is unused; would land vLLM-specific reply fields on `providerMetadata` without `responseMap` reshaping. | openai-compat dist `index.js:1870` | Note only. |

## D. Telemetry / debugging

| # | Sev | Finding | Receipt | Fix |
| - | - | - | - | - |
| D1 | P2 | **Wire capture records the request only, re-parsed in `wrapFetch`.** The `doStream` result carries `request.body` (the exact bytes after `transformRequestBody`) and `response.headers` (Anthropic `request-id`, rate limits, OR `x-openrouter-*` routing). Neither is captured. | `backends/v4/fetch.ts:282-297`; `contract/backend.ts:68-73` | Extend `WireCaptureSink` with `responseHeaders` and the SDK's `request.body`; capture at `streamOnce` from the result, keep `wrapFetch` for the shaping only. |
| D2 | P3 | **`includeRawChunks` / the `raw` stream part are unused** — a free "record the exact wire reply" tap behind a flag. | provider dist `index.d.ts:1470`; `backends/v4/stream.ts` (no `raw` arm) | Connection-level debug toggle → `includeRawChunks: true`; the reducer forwards `raw` parts to the capture sink. |
| D3 | P3 | **OR `debug.echo_upstream_body`** shows what OR sent upstream after routing/caching (secrets redacted). Unreachable. | `openrouter/README.md:353-381` | Same toggle as D2 on the OR transport. |
| D4 | P3 | **Span events are retry-only.** `addSpanEvent` fires for `provider.retry`/`provider.retry.abandoned` and nothing else. | `backends/kit/retry.ts:134,140` | Emit first-delta, finish reason, cache hit ratio, and the A3 warnings as span events. |

## E. Hygiene

| # | Sev | Finding | Receipt | Fix |
| - | - | - | - | - |
| E1 | P2 | **Test coverage does not match the package's own pin contract.** The catalog comment says every bump re-runs wire-capture byte pins under `tests/inference/backends/openai-compat/**`; only `body.test.ts` and `v4/fetch.test.ts` exist. No tests for the stream reducer, result fold, `prompt.ts`, model factory, embed, images, either batch runner, or the anthropic-messages wire. | `pnpm-workspace.yaml` catalog block; `tests/inference/` (9 files) | Red-first pins per file, plus one wire-capture byte pin per transport (openai-compatible, openrouter, anthropic) that fails on a caret bump. |
| E2 | P4 | `createOpenAICompatible({ name: providerId })` with a `-`/`_` in the id makes the SDK push a "deprecated providerOptions key" warning every call because `providerOptions` is keyed by the raw name. Harmless until A3 surfaces it. | openai-compat dist `index.js:25-45,594-600` | Key `providerOptions` by `toCamelCase(providerId)` (the SDK reads both; the camel form is the non-deprecated one). |
| E3 | P4 | `tool-input-delta`, `source`, provider-executed `tool-result` parts are dropped by the reducer. Not a regression (the old backend streamed none), a UI ceiling. | `backends/v4/stream.ts:68-84` | Note; wire when the bus grows a tool-delta kind. |
| E4 | P4 | `v4/prompt.ts` `toolInput` returns the raw string on malformed JSON; the converter re-stringifies it (double-encoded). Documented as intentional. | `backends/v4/prompt.ts:94-103` | Note only. |

## Verified correct (no action)

- openai-compatible: `transformRequestBody`, `includeUsage`, `supportsStructuredOutputs`, `fetch`, `imageModel`, `embeddingModel` all exist on 3.0.53; unmodelled sampler knobs via `providerOptions[name]` are spread into the body (`index.js:594-600`); V4 `reasoning` maps to `reasoning_effort` (`:602`); URL file parts pass through as `image_url`/`video_url` (`:162-173`) so `supportedUrls` is moot when driving `doStream` directly.
- Anthropic: `thinking` adaptive/enabled/disabled, `display`, `effort` (incl. `max`), `disableParallelToolUse`, `structuredOutputMode`, `sendReasoning`, per-message `cacheControl` with `ttl:"1h"`, `clearAt` all match the 4.0.58 schema; a missing `budgetTokens` on `enabled` defaults to 1024 (with a warning A3 will now surface); `providerOptions.anthropic.thinking`/`effort` take precedence over V4 `reasoning`, and the package sets both consistently.
- OpenRouter 3.0.0: `usage.include`, `structuredOutputs.strict`, `parallelToolCalls`, `extraBody`, `compatibility:"strict"`, `providerOptions.openrouter.{reasoning, models, cacheControl}` exist; `providerMetadata.openrouter.usage.cost` read is right for non-BYOK.
- Embed honours `maxEmbeddingsPerCall`; the error classifier reads `statusCode`/`responseBody`, matching `APICallError`.
- Not taking `ai` core (`streamText`, `embedMany`, `wrapLanguageModel`, `streamRetries`, `experimental_telemetry`, `rerank`) is deliberate per §8.0 and consistently done; `wrapFetch` covers the middleware need. `extractReasoningMiddleware` is equivalent to `reasoningKeys`.
- Effort vocabulary (`max`→`xhigh` on openai-compat, native on Anthropic, `minimal` dropped loudly on Anthropic), verbosity, thinking display: single-wire knobs drop loudly elsewhere. Finish reasons fold correctly with the raw kept.
- Vehicle selection (`response-format` when structured, else `forced-tool`) and `structuredOutputMode: "outputFormat"` on the batch wire are right, modulo A6.
- Role handling / system-row demotion live in `assembly/shape.ts`; the SDK's Anthropic same-role merge is a no-op after the floor. Correct split.
- The funnel's `dynamicContextChannel` (`funnel/resolve-chat.ts:292`) and the assembly's mid-conversation gate (`chat/engine/pipeline.ts:613` → `acceptsMidConversationSystem`, `contracts/inference/capability/reads.ts:60`) read the SAME `turns.midConversationSystem` cell, so the `message-tail` row is only emitted where the assembly also keeps depth-0 system rows. Verified by `pnpm ast ident midConversationSystem` (14 hits, 8 files).

## Structural confirmation (2026-09-19, `pnpm ast`, corpus `packages/inference/src` = 104 files unless noted)

Every negative claim below carries a non-zero scanned count; a `0` is a confirmed absence, not a failed search.

| Row | Lens | Result |
| - | - | - |
| A1 | `ident signature`, `literal reasoning_details`, `literal reasoning --in …/v4/prompt.ts` | 0 · 0 · 0 — no signature/reasoning_details/reasoning-part anywhere in the package; `ident providerMetadata --in …/v4/stream.ts` = 5 hits, all the `finish`-part slot (`:94`), none on reasoning parts |
| A2 | `ident endsOnAssistant` | 3 hits in 2 files: `prompt.ts:46,244` (defined) + `openai-compat/body.ts:133` (vLLM prefill only); ZERO in `anthropic-messages/` |
| A3 | `ident warnings --in …/v4/result.ts` · `--in …/v4/batch.ts` | result.ts: 4 hits, all `ctx.warnings`, `drain.warnings` never read; batch.ts: 0 — `doGenerate().warnings` never read |
| A4 | `literal upstreamInferenceCost --in packages` (3406 files) | 0 |
| A5 | `literal stopDetails --in packages` · `literal fallbacks` | 0 · 0 |
| A7 | `ident assistantMedia` | 8 hits: built in `prompt.ts`, consumed in `openai-compat/body.ts:118,128`, only WARNED on in `anthropic-messages/chat.ts:280` |
| B1 | `ident reasoningEffort --in packages/server/src/domain/chat` (138 files) | 8 hits; the value source is `engine.ts:1399` `prep.intent.effort` — the REQUESTED intent, confirmed |
| B4 | `ident reasoningRedacted --in packages` | 3 hits; `v4/result.ts:79` is the `length === 0 && reasoningTokens > 0` heuristic; agent-sdk derives it from actual redacted blocks (`runner.ts:507`) — the two wires disagree on what the flag MEANS |
| B5 | `ident reasoningTokens --in packages` | 9 hits, none in `packages/db`; sole product consumer `compose/rpg.ts:990` |
| B6 | `ident rateLimit`, `literal rate_limit` | agent-sdk populates a real `RateLimitSnapshot` (`runner.ts:677`) and the bus has the `rate_limit` event (`contract/events.ts:44`); `v4/result.ts:93` hard-codes `null` — the field is LIVE on one wire and dead on two |
| B7 | `ident responseId`, `ident generationId --in …/anthropic-messages/chat.ts` | `responseId` captured in `stream.ts:90`, consumed only at `openai-compat/chat.ts:454` (OR-gated); anthropic `chat.ts:320` = `null` |
| B8 | `ident costDetails --in packages` | 5 hits, none in `packages/db` or `packages/server` |
| C1 | `ident strict` · `ident inputExamples --in packages` | `strict` appears 9× but every hit is RESPONSE-FORMAT strictness; none on a tool; `inputExamples` 0 in 3401 files |
| C2 | `literal userId` | 0 |
| C3 | `literal response-healing --in packages` · `literal plugins` | 0 · 0 (the hard-coded plugin id is spelled via the `CONTEXT_COMPRESSION_PLUGIN` const, so the literal lens is blind to it by design — `openai-compat/chat.ts:43,229-232` is the receipt) |
| C4 | `ident cacheControl --in …/v4/options.ts` | 0 — `functionTools` sets no per-tool provider options |
| C5/C6 | `literal toolChanges` · `literal contextManagement --in packages` | 0 · 0 |
| D2 | `ident includeRawChunks --in packages` · `literal raw --in …/v4/stream.ts` | 0 · 0 |
| D3 | `literal echo_upstream_body --in packages` | 0 |
| D4 | `callers addSpanEvent` | 8 call sites: 2 retry (`kit/retry.ts:134,140`) + 6 catalog-cache (`catalog/mirror.ts`); ZERO on the turn path |
| E2 | `ident toCamelCase` | 0 |
| E3 | `literal tool-input-delta` | 0 |

## F. Rolling our own where the SDK has it — verdicts

`ai` core is design-excluded for the agent loop, UI stream, gateway, tool executor and persistence (§8.0). It is NOT excluded for discrete helpers, and `wrapLanguageModel` is named as permitted. Judged on that line:

| Ours | SDK equivalent | Verdict |
| - | - | - |
| Preset `reasoningParse` (`autoParse`/`prefix`/`suffix`, `THINK_*_DEFAULT` in `contracts/preset/index.ts:1940,2180`) — a POST-HOC split of `<think>…</think>` out of the finished reply | `extractReasoningMiddleware({ tagName, startWithReasoning })` via `wrapLanguageModel` — splits AT STREAM TIME into real `reasoning-delta` parts, handles a tag split across chunks | **Adopt.** Ours cannot stream the reasoning as reasoning (the bus sees prose until the split runs) and duplicates a solved chunk-boundary problem. Map `reasoningParse.prefix` → `tagName`; keep the preset as the user control. Design-permitted (`wrapLanguageModel`). |
| `kit/retry.ts` pre-commit retry with `rate_limit.resetsAt` and commit semantics | core `maxRetries` (call-start only) + `streamRetries` | **Keep ours.** The commit boundary is tied to our bus; the SDK's retry is core-only. Do adopt `APICallError.isRetryable` / `responseHeaders["retry-after"]` as inputs to the backoff (today ignored). |
| `kit/error-classify.ts` status table + moderation + secret scrub | `APICallError` (`statusCode`, `responseBody`, `isRetryable`, `responseHeaders`), `isInstance` guards | **Keep ours**, but narrow with `APICallError.isInstance(err)` instead of duck-typing `statusCode` (`pnpm ast ident isInstance` = 0). Ours carries moderation/billing/abort/scrub the SDK lacks. |
| `openai-compat/embed.ts` token-bounded batching, window clamp, dimension fallback, ChatML scaffold, L2 normalise, per-POST deadline | `embedMany` (`maxEmbeddingsPerCall` chunking, `maxParallelCalls`, retries) | **Keep ours.** `embedMany` has no token budget, no scaffold, no clamp — the vLLM measurements the file header cites are the whole point. |
| `kit/sse.ts` + `wrapFetch` `responseMap`/`reasoningKeys` reshape | the SDK's own SSE parser + `metadataExtractor` | **Keep** — it exists only to make a non-OpenAI reply parse at all; nothing in the SDK reshapes a foreign chunk. Sole consumer is `v4/fetch.ts` (`importers` = 2 files, one the barrel). |
| `kit/cache-control.ts` breakpoint placer | none (SDK places nothing automatically) | Keep. |
| `v4/prompt.ts` history → V4 prompt | `convertToModelMessages` / `standardizePrompt` (core, UIMessage-shaped) | Keep — ours starts from the D45 send model, not UIMessage. |
| `scrubWireSchema` per-wire JSON-schema subsets | none per-provider (Anthropic provider only normalises `$schema`) | Keep. |
| `kit/idle-timeout.ts` idle abort | core `timeout` (per-call) | Keep — idle-between-parts is not a per-call timeout. |
| `catalog/openrouter.ts` `/models`, `/credits`, `/generation` | none in the OR provider | Keep (designed, §8.2). |
| `@orb/kit/vector-math` cosine | `cosineSimilarity` (core) | Keep — trivial, and the discovery domain's in-RAM cosine is an owner ruling. |
| structured task: we return TEXT and let the caller parse | `Output.object` (core; repair + zod validation) | Keep as-is (core loop), but OR `response-healing` (C3) is the server-side half of what `Output.object` repairs. |

## Suggested lane cut (three lanes, disjoint files)

A7 joins lane 1 (anthropic transport `shapeBody`); the F-table "Adopt" row (`extractReasoningMiddleware`) joins lane 3.

1. **Wire correctness** — A1, A2, A3, B2, B4, D1, E2: `contracts/chat/bus.ts`, `inference/backends/v4/*`, `backends/anthropic-messages/chat.ts`, `backends/openai-compat/chat.ts`, `contract/backend.ts`; plus the E1 pins for every file touched.
2. **Record truth** — A4, A5, B1, B3, B5, B6, B7, B8, A6: `contracts/inference/usage.ts`, `db/schema/chat.ts` (forward migration), `chat/engine/engine.ts`, `persistence/canon-write.ts`, `capability/sources/curated/anthropic.ts`, `roles/role-clients.ts`.
3. **Doors** — C1, C2, C3, C4, D2, D3, D4: `contract/chat.ts` (`WireTool`), `backends/v4/options.ts`, the two chat wires' extras readers, `backends/openai-compat/model.ts`, `backends/kit/retry.ts`.

C5, C6, C7 are owner forks (default: C6 expose-off, C5/C7 park with wake conditions).
