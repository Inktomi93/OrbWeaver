---
kind: law
status: active
updated: 2026-11-17
---

# Vercel AI SDK surface — installed packages, our use, and the hand-roll ledger

The mined surface of the Vercel AI SDK packages this repo installs: what each ships, what we import, where our
code hand-rolls something the SDK offers, and what sits unused. Four mining passes read the installed dists
(types and the executed JavaScript) and diffed every export against every import statement in the repo
(9,515 source files scanned; `Object.keys` of the built modules cross-checked the runtime lists). Claims carry
`path:line` into `node_modules/.pnpm/<pkg>/...` — those pins move, so re-verify a citation before acting on its
line number, not its fact. Per-provider capability rulings live in the curated sources; transport behavior lives
in the backend file headers. This doc states what the SDKs do, not what we decided.

## Why our footprint looks empty: we live below `streamText`

`ai` exposes 178 runtime exports; we import two (`extractReasoningMiddleware`, `wrapLanguageModel`, plus a type,
in `packages/inference/src/backends/openai-compat/think-tags.ts` and `model.ts`). That is architecture, not neglect. The stack has three
floors:

- **The core (`ai`)** sits above the provider boundary: `streamText`/`generateText`, the agent loop, UI streams,
  the telemetry dispatcher. We never import the core's execution — a bare `doStream()` call never reaches the
  core's telemetry dispatcher at all (ai dist index.js:4519 builds it inside `streamText`).
- **The provider specification (`@ai-sdk/provider`)** is the contract between floors. It is versioned `v1`…`v4`;
  `specificationVersion: 'v4'` is a literal on every current interface (`@ai-sdk/provider/dist/index.d.ts:994`),
  and the same file still declares the V2 (:1997) and V3 (:1945) interfaces because older providers must stay
  consumable. Our `packages/inference/src/backends/v4/` consumes V4 directly — fold the stream, build the result — which is why the
  core's helpers are mostly inapplicable to us rather than overlooked.
- **`@ai-sdk/provider-utils`** sits inside the provider packages. We never import it (0 of 202 exports); its
  helpers operate on requests the provider factories already own.

Provider spec versions are not package versions: `@ai-sdk/provider@4.0.x` carries spec `v4` (coincidence), and the
whole stack pins as one unit because every provider's own provider-dependency must match the patched pin exactly
(`pnpm-workspace.yaml` catalog comment, `:204-216`).

## Installed inventory and import footprint

| Package | Pin | Runtime exports | Imported | Where |
| - | - | - | - | - |
| `ai` | 7.0.148 | 178 (+306 types) | 2 | `think-tags.ts`, `packages/inference/src/backends/openai-compat/model.ts` |
| `@ai-sdk/provider` | 4.0.31 (patched) | 22 (+251 types) | 0 runtime, ~22 types | `packages/inference/src/contract/v4.ts`, `packages/inference/src/backends/v4/*` |
| `@ai-sdk/provider-utils` | 5.0.65 (patched) | 118 (+84 types) | 0 | transitive of `ai` only |
| `@ai-sdk/openai` | 4.0.99 | 53 (+37 types) | 1 (`createOpenAI`) | `packages/inference/src/backends/openai-compat/model.ts:9` |
| `@ai-sdk/openai-compatible` | 3.0.75 | 11 (+16 types) | 1 (`createOpenAICompatible`) | `model.ts:10` |
| `@ai-sdk/anthropic` | 4.0.85 | 14 (+~15 types) | 1 (`createAnthropic`) | `packages/inference/src/backends/anthropic-messages/model.ts:5` |
| `@ai-sdk/google` | 4.0.102 | 44 (+types) | 3 | `packages/inference/src/backends/google/model.ts`, `packages/inference/src/backends/google/embed.ts` |
| `@openrouter/ai-sdk-provider` | 3.1.0 | 3 (+19 types) | 1 (`createOpenRouter`) | `packages/inference/src/backends/openai-compat/model.ts:219` |

## Patches: required, not drifted, port on every bump

Both patches were added in `a8110c01c7` (dependency-declaration checking in compiler worlds) and exist for
`exactOptionalPropertyTypes: true` (`tsconfig.base.json:68`):

- `@ai-sdk__provider@4.0.31.patch` — adds `| undefined` to `ImageModelV4.supportsFileInputs` /
  `supportsMaskInputs` (applied at dist:1016,:1023). Upstream still unfixed in 4.0.38 (dist:1028,:1035).
- `@ai-sdk__provider-utils@5.0.65.patch` — `NeverOptional` gains the all-undefined branch, and the `tool()` overload
  stops widening away `execute` (applied at dist:1677,:2332). Upstream still unfixed in 5.0.81 (dist:1763,:2510).

`patch -R --dry-run` reverses both cleanly against the installed trees. A copy of provider 4.0.38 sits in
`node_modules/.pnpm/` but appears nowhere in `pnpm-lock.yaml` — an orphan directory from an earlier pin, not a
second unpatched copy in the graph. **Rule: any bump of these two pins must port the patch; check the upstream
line first, because the fix may have landed by then.**

## A premise correction worth writing down

The `compatibility: "strict" | "compatible"` mode is **not** a feature of `@ai-sdk/openai` or
`@ai-sdk/openai-compatible` (`rg -c compatibility` finds zero uses in the compatible dist; openai keeps only an
unrelated warning type at `@ai-sdk/openai/dist/index.js:990`). It is the OpenRouter provider's setting, and it
changes exactly one thing there: `stream_options.include_usage` is sent in `strict` and dropped otherwise
(`@openrouter/ai-sdk-provider/dist/index.js:4565,:5372`). Our `model.ts:219` passes `strict`. On the compatible
package, `include_usage` is governed by `includeUsage` instead — which we do pass (`model.ts:127-131`).

## Hand-roll ledger — what the SDK could do and we do anyway, and why

Judgments: **necessary** (the SDK cannot), **stricter** (the SDK can, loses a written law), **unused** (adopt it).

| Our site | SDK state | Verdict | The law the swap would trade |
| - | - | - | - |
| `packages/inference/src/backends/v4/stream.ts` fold | core fold lives in `streamText`, one floor above us; usage combiners are internal (not exported) | necessary | drops `reasoningParts` provenance, `textSignatures`, per-part ordinals, `servedModel`, warnings |
| synthesized-finish guard (`stream.ts:283`) | `NoContentGeneratedError` is exported but never thrown in the core dist | stricter | reopens the empty-reply-committed-as-success bug (issue 1400) |
| usage fold (`packages/inference/src/backends/v4/result.ts` → `packages/contracts/src/inference/usage.ts`) | `asLanguageModelUsage` is internal | necessary+stricter | theirs keeps noCache/text splits; ours holds null-vs-0 discipline, cost provenance, cap facts |
| `packages/inference/src/backends/v4/fetch.ts wrapFetch`, `packages/inference/src/backends/http/fetch-json.ts` | `postJsonToApi` family | stricter | manual-redirect host pin, scrubbed capped error bodies, non-JSON-2xx as retryable server error, `ProviderError` classification |
| capped reads (`readCappedStream`, `readCapped`) | `readResponseWithSizeLimit` (provider-utils:1621) | stricter | code-unit cap with the secret-scrub over-read seam (issue 1820); theirs is byte-counted and throws instead of keeping the prefix |
| SSE parse (`packages/inference/src/backends/http/sse.ts:63`) | `parseJsonEventStream` (provider-utils:3365) | stricter | malformed `data:` must THROW (issue 758); theirs yields a value call sites drop; plus the 1 MiB line cap |
| `error-classify.ts` | `APICallError.isRetryable` | stricter | theirs is one boolean; ours is the kind table feeding the key-strike rule and the 403 moderation discriminator |
| `abort-flatten.ts` | `isAbortError` (provider-utils:543) | necessary | the helper counts `TimeoutError` as abort — the exact conflation the file exists to prevent; `createAbortError` is not even exported |
| `packages/inference/src/backends/http/retry.ts` pre-commit retry | `retryWithExponentialBackoff` (provider-utils:3737) | stricter | no committed-output gate: the SDK loop would replay deltas that already hit the bus |
| `packages/inference/src/backends/v4/prompt.ts buildWirePlan` | `standardizePrompt` internal; no `ModelMessage` layer here | necessary | the plan's row indices are the contract the placer and shaper share |
| openai-compat body shaping (`body.ts`) | flat pass-through of unknown `providerOptions` keys | stricter | ordered extras merge with warnings, the SDK-owned key list, sampler-alias ownership, fold/prefill/template-kwargs the SDK converters never emit |
| `cache_control` placement (`packages/inference/src/backends/wire/cache-control.ts`) | Anthropic SDK has NO placer (forwards what we stamp, dist js:2322,:2386,:2524); compatible has message-level only | necessary+stricter | row-index and part-level breakpoints have no SDK home on our transports |
| anthropic/google thinking spelling | SDKs warn-and-rewrite post-resolution | stricter | we decide pre-request via curated rows, so the rewrite never fires |
| google usage reads (`packages/inference/src/backends/google/usage.ts`) | normalized shape coerces absence to 0, drops modalities, never surfaces `modelVersion` | necessary | we read raw chunks to keep null-vs-0 and served-model identity |
| `parallel_tool_calls:false`, `top_k`/`min_p`, prefill, image detail on compatible wire | untyped; pass-through survives them | hand-rolled (SDK silent) | nothing to adopt; the pass-through is the SDK's extension seam |

**Adopt list (the SDK genuinely has the door):**

1. `convertUsage` (openai-compatible config, dist js:372-373): the default mapper drops `cache_write_tokens`
   (dist:40-60) — a fact our own `chat.ts:82` comments — and we then hand-roll `nativeOpenAiUsageOverlay` gated
   to `providerId === "openai"`, so endpoints that DO report the field currently yield `null`. The hook is the
   supported home for that read.
2. `extractReasoningMiddleware` literal-delimiter form (ai dist index.d.ts:9696-9698: `tagName` accepts
   `{ opening, closing }`; shipped since 7.0.128, we pin above). `think-tags.ts:20-23` claims a preset's
   `[thinking]`/`[/thinking]` pair is "INEXPRESSIBLE" — stale; bracket presets silently miss the stream-time
   split. Fix `tagNameOf`; keep the `reasoningKeys` guard; the post-hoc split stays as fallback.
3. `promptCacheKey`/`promptCacheOptions`/`promptCacheRetention` on `/responses` — fully typed and written by
   `@ai-sdk/openai` (dist js:4361-4383 → 6425-6427) while `responses.ts` passes none. Needs a ruling first
   (below).
4. Smaller, each with a ruling: `supportsMultiPartToolContent` (off ⇒ structured tool results arrive
   JSON-stringified, dist:228), `metadataExtractor` (**LANDED** —
   `packages/inference/src/backends/openai-compat/system-fingerprint.ts`
   reads the raw body's `system_fingerprint`; its readers are the `provider.finish` span attribute
   `systemFingerprint` and the persisted `message_variants.metadata.system_fingerprint`), per-part `imageDetail`
   on `createOpenAI().chat()` (dist js:571).

## Unused capability worth a look (not defects)

- **Google `continuationToken`**: the SDK round-trips a truncated long reply and auto-continues
  (`@ai-sdk/google/dist/index.js:229-232,:1847-1861`). Our `outputCapReached` path treats the same truncation
  as terminal. A possible mitigation lane, needs the cap-laws read first.
- **Google server-side tools** (`googleSearch`, url-context, file search — internal:499, dist js:3277): the
  provider RETRIEVES, unlike Anthropic's server tools which the architecture lock excludes. Grounding metadata
  would land in `providerMetadata` (`GoogleProviderMetadata` carries `groundingMetadata`/`safetyRatings`).
- **Anthropic `safeguards`** (dist js:3839, beta header js:3932) and `iterations[]` per-model billing rows
  (js:1914-1934) which our cost fold ignores. `anthropicBeta` has no modeled path for an unmodeled beta.
- **V4 stream parts this graph does not model**: `packages/inference/src/backends/v4/stream.ts` folds the content
  and control parts every turn runs on. Tool-input delta triples are safe by contract (the terminal `tool-call`
  is mandatory, provider dist:3370-3382) but the code does not say so, and a deltas-only wire would yield zero
  tool calls silently — one comment plus one guard owed. `source` parts (web-search citations; OR emits them,
  anthropic 7 sites) ride into `ChatResult.sources`; the fold keeps them (ruling 2 below).
- Model families we simply do not run (realtime, speech, transcription, video, files, batch, interactions)
  account for most of the 481 unimported core names and the google 41.

## Footguns and drifted citations

- **The factory `name` setting re-keys everything.** `providerOptionsName = provider.split(".")[0]`
  (`@ai-sdk/anthropic/dist/index.js:5807`; default `"anthropic"` at :1145) keys BOTH providerOptions and
  providerMetadata. Setting `name:` on any factory would silently empty our `providerMetadata.anthropic`
  readers — the thinking-drop alarm and the refusal taxonomy. No call site sets it; treat as forbidden, and
  headers on the model.ts factories should say so.
- **`providerMetadata` is filed under the PROVIDEROPTIONS key, not the registry id.** The compatible SDK
  resolves `metadataKey = resolveProviderOptionsKey(providerOptionsName, providerOptions)` (dist
  `index.js:13-17`) and files its own nested writes at `providerMetadata[metadataKey]` (:419) — the CAMEL form
  of the provider name, because we always write `providerOptions[providerOptionsKey(id)]`
  (`packages/inference/src/backends/openai-compat/chat.ts`). A fold reading the raw row id found nothing for
  every hyphenated id. Write side, extractor bag key and fold read now share `providerOptionsKey`
  (`packages/inference/src/backends/openai-compat/model.ts`) through
  `ResultContext.providerMetadataKey` (board item 3577, resolved).
- **`metadataExtractor`'s bag is spread at the TOP LEVEL of `providerMetadata`, not nested under the
  provider's key.** `extractMetadata({ parsedBody })` (d.ts:36-47, call site dist `index.js:498`) and the
  stream extractor's `processChunk`/`buildMetadata` (:618) receive NO headers and NO key, and the returned bag
  is spread beside the SDK's own writes (:496-499, :735-738). The extractor therefore chooses its own key; ours
  is the same `providerOptionsKey` derivation the fold reads. It is passed to the chat model only (:1493) —
  embedding and image models never call it.
- `openai-compatible`'s `languageModel(id, config)` accepts a per-model `config` that the implementation IGNORES
  (dist js:1485) despite the types. Build nothing on it.
- Header citation drift, closed: every drift site (provider-metadata's OR type cites, abort-flatten's probe-package
  cite, `packages/inference/src/backends/v4/stream.ts` and `packages/inference/src/backends/v4/fetch.ts`'s OR dist cites) was re-verified or
  re-pinned at the installed dists during the source-parts landing and the v4 comment pass. Code cannot reopen
  the class: the section below bars line numbers from code comments entirely.
- `openrouter-reasoning-wire.int.test.ts` asserts the request side (`reasoning.effort`) but never the
  `reasoning_details` replay its name promises.
- The OR typed `reasoning.effort` set lacks `"max"`; our `reasoning.ts:35` works only because we write the raw
  body past the SDK's schema.

## How code cites the SDK dists: intent, not coordinates

A code comment names the FACT the trap rests on — the behaviour in present tense, the greppable identifier (the
function, string literal or field name a re-measurer searches for), and the provenance stamp `@pkg@version`.
NO line numbers into dist files: a shipped `index.js` reflows on every patch release, and a drifted line number is
a worse cite than none — false precision nobody re-verifies mid-task. The line-number inventory lives HERE and in
plan docs, where the standing re-mine-at-bump rule already refreshes it. Bad: a line range pointing into the
provider's shipped bundle, quoted as if it were a fact. Good: "the `url_citation` annotation builder defaults
missing spans to 0 (`@openrouter/ai-sdk-provider@3.1.0`)".

## Rulings on the open questions

1. `/responses` prompt-cache axis: **adopted** — `promptCacheKey`/`promptCacheOptions`/`promptCacheRetention`
   are passed to the openai `/responses` route under the same capability gates the chat route uses.
2. Web-search `source` parts: the app runs no web-search feature, but the parts are **stored, not dropped** —
   `ChatResult` carries the field and the fold keeps them; no UI is promised.
3. Google `continuationToken`: the domain path wins — a truncated reply continues through the EXISTING
   `continue` turn intent (`autoContinueRounds` / `runAutoContinue`, already gated on `finishReason === "length"`),
   not a new backend leg loop. The owner ruled the leg loop over-engineered: its resume fidelity and
   invisibility do not pay for a capability cell, a funnel policy and a ledger row, and its billing is a wash
   against the continue's canon re-send. The leg-loop design stays parked at `docs/plans/` for the day resume
   quality is demonstrably a problem. 3575's remaining scope is the record half and a proof that
   `continueTurn` continues a Google truncation correctly on the native route.
4. Google server-side retrieval tools: **not supported** by owner decision; nothing in the architecture needs
   re-reading because nothing reaches the rule.
5. Anthropic safeguards: **declined** — the owner's users are roleplaying catgirls, not paying for a compliance
   classifier. No feature, no inventory, no code; the betas stay unreachable by omission and that is the ruling.
6. Anthropic `fallbacks`/`contextManagement`: **banned from the extras allowlist** until per-iteration cost
   attribution exists — the allowlist may not carry a key whose effect the cost fold miscounts. The
   attribution lane is the condition for re-listing. (Boarded item.)
7. `metadataExtractor`: **adopted** on the openai-compatible chat model for `system_fingerprint` only. The
   compatible SDK's response schema strips the field before our drain sees it, and no hook on
   `@ai-sdk/openai` or `@openrouter/ai-sdk-provider` models it at all (measured against the installed pins). The extractor's
   bag key and the fold read share `providerOptionsKey`, which is also the 3577 fix.

## Method note

Full mining output (497-row provider export table, 484-row core export table, per-site overlap tables with dist
`path:line` for every claim) lives in the raw pass files under /tmp/opencode/sdk-surface/ — one file per
pass (ai-core, openai, anthropic-google, provider-layer) — while this doc keeps the settled conclusions. Re-run a
lane after any SDK bump: these facts are pins, not laws of nature.
