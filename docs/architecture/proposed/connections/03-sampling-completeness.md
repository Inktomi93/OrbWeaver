---
kind: spec
status: draft
updated: 2026-07-10
---

# 03 — sampling completeness (D68): minP end-to-end · verbosity live · direct-transport Claude sampling

Three verified gaps in the generation-param story, closed along the part 01 one-rule. Every change names
its file; nothing else moves. All facts `sg`/type-verified 2026-07-10.

## 0. The verified gaps

- **`minP` is broken END-TO-END.** The capability declares it (`ModelCapability.sampling.minP`,
  `contracts/src/connection/index.ts:151`); the resolver synthesizes it from OR's `min_p`
  (`resolve-model-capability.ts:116-118`) and the vLLM/BYO static profiles carry it (`:166`). BUT:
  `ResolvedSampling` OMITS it (`contract/resolve.ts:59-69`), the funnel has no `minP` pass
  (`resolve-chat.ts:165-206`), the OR `chatSamplingFields` doesn't emit it (`shared.ts:208-230` — though
  `ChatRequest.minP` is a first-class SDK field, `chatrequest.d.ts:152`), the kit `OpenAiSamplingInput`
  lacks it (`backends/kit/openai-compat/body.ts:16-27`), and the one wire slot that exists
  (`vllm/engine/chat-completion.ts:139` `min_p`) never receives it. **Deeper: `UserIntent` has NO `minP`
  field at all** (`contracts/src/preset/index.ts:130-179`) — the user can't set it, and the ST importer
  actively DROPS `min_p` with "no neo sampling vocab" (`preset/index.ts:1434-1437`). RP-critical.
- **`verbosity` is DEAD.** The capability axis exists (`connection/index.ts:110-113,156`) and the
  resolver synthesizes it for the openai family when OR lists it (`resolve-model-capability.ts:141-148`;
  OR's `Parameter` enum has `"verbosity"`, `parameter.d.ts:28`) — but `UserIntent` has no field,
  `ResolvedChatKnobs` has no slot, and NO runner maps it.
- **The direct-transport Claude sampling** is unlocked-but-per-model (§3) — the CLI transport denies it
  entirely (curated `sampling: {}`, `chat-models.ts:38-41`).

## 1. `minP` — one new intent knob, threaded through every wire that has a slot

| layer | change | file |
| - | - | - |
| user intent | `generationKnobSchemas.minP` (bounds 0–1 — ONE home, mirrors the resolver `MIN_P_RANGE`) + `userIntentSchema.minP` + the same spread into `presetFormValuesSchema` + the `copyParamsToForm` scalar copy | `contracts/src/preset/index.ts:107-124,130-179,878-…` |
| ST import | the mapper STOPS dropping `min_p` ("no neo sampling vocab") and maps it → `out["minP"]` | `contracts/src/preset/index.ts:1434-1437` |
| resolved shape | `ResolvedSampling.minP?: number` | `infra/providers/contract/resolve.ts:59-69` |
| funnel | `resolveNumeric("minP", params.minP, s.minP, warnings)` + spread — the existing drop-and-warn pass, no new machinery | `infra/providers/resolve-chat.ts:165-206` |
| OR chat-completions | `chatSamplingFields` emits `minP` (first-class SDK field, `chatrequest.d.ts:152`) | `backends/openrouter/runners/chat/shared.ts:208-230` |
| kit (vLLM + BYO) | `OpenAiSamplingInput.minP` + `buildOpenAiSamplingFields` emits `min_p` | `backends/kit/openai-compat/body.ts:16-27,38-55` |
| vLLM chat surface | the `buildOpenAiSamplingFields` call gains `minP: p.minP` (the engine's own `min_p` slot at `vllm/engine/chat-completion.ts:139` serves the non-chat engine path and is untouched) | `vllm/surfaces/chat.ts:128-139` |
| custom-byo | `samplingFromIntent` gains `minP` (this runner projects `UserIntent` directly — user-declared profile, Tier-3b §10) | `backends/custom-byo/runners/chat.ts:198-211` |
| capability | ALREADY DONE — `sampling.minP` range (`connection/index.ts:151`), OR synthesis (`resolve-model-capability.ts:116-118`), static profiles (`:166`) | — |

Where there is NO wire slot the existing behavior is correct by construction: the openai-responses wire
has no `min_p` field (`responsesrequest.d.ts`, sg-verified) — a responses-served model whose catalog
lists `min_p` still resolves it, the runner has no field to map, and the capability panel renders what
the descriptor lists so the mismatch is visible, not silent. **Rider (same shape, one line):**
`ResponsesRequest.topK` EXISTS (`responsesrequest.d.ts:176`) and the responses runner maps only
temperature/topP today — W2 maps the already-resolved `topK` too.

## 2. `verbosity` — a new funnel output, wired live on its real wire home

**The wire fact (type-verified — corrects the original brief).** The OR `ChatRequest` does NOT carry a
verbosity field (full field list read, `chatrequest.d.ts`); on OR the knob's wire home is the Responses
API — `ResponsesRequest.text?: TextExtendedConfig` (`responsesrequest.d.ts:157-159`) with `verbosity`
(`textextendedconfig.d.ts:22`). So the live wiring lands on the responses runner.

| layer | change | file |
| - | - | - |
| user intent | `userIntentSchema.verbosity` — derived from the capability vocab (`verbositySchema`, `connection/index.ts:110-113`), never re-spelled | `contracts/src/preset/index.ts` |
| resolved shape | `ResolvedChatKnobs.verbosity?: Verbosity` + a new `WARNING_CODES` member `"verbosity_dropped"` (one code per distinct site, per the tuple's own rule) | `infra/providers/contract/resolve.ts:15-26,77-82` |
| funnel | `resolveVerbosity`: kept iff `capability.verbosity?.includes(requested)`; dropped + warned otherwise (the `resolveEffort` shape) | `infra/providers/resolve-chat.ts` |
| OR responses runner | the LIVE wire: `buildResponsesTextFormat` generalizes to `buildResponsesText(format?, verbosity?)` → `text: { format?, verbosity? }` (emitted when either is set) — `ResponsesRequest.text.verbosity` first-class (`responsesrequest.d.ts:157-159`; our 3-member union is a subset of OR's open enum) | `backends/openrouter/runners/chat/responses.ts:149-160,181-212` |
| OR chat-completions | NO SDK field on `ChatRequest` (0.13.19, full-field-list-verified). The runner emits a runner-side `warning` event when `resolved.verbosity` is set (the wire-shape-drop precedent: the OR effort/max\_tokens XOR, Esoteric §8) — verify-then-add when the SDK grows the field | `backends/openrouter/runners/chat/chat-completions.ts` |
| everything else | the capability never lists `verbosity` outside the openai family (`resolve-model-capability.ts:141-148`), so the funnel drops it with the warning — no agent-sdk/vLLM/BYO/anth-direct change | — |

So a verbosity-capable model (a GPT-5-class model on the responses api — its native home) actually
receives the knob; on the one wire with no field the drop is LOUD, never silent.

## 3. Direct-transport Claude sampling — PER-MODEL, fail-closed (corrects the brief)

The raw Messages wire carries `temperature`/`top_p`/`top_k`/`stop_sequences` (+ required `max_tokens`)
— `MessageCreateParams`, `@anthropic-ai/sdk@0.106.0` `resources/messages/messages.d.ts:1982,2096-2100,
2116-2121,2218-2227`. **But the fact is PER-MODEL, not blanket** (type-read 2026-07-10, corrects the
"anth-direct unlocks temp/topP/topK" framing): the SDK marks all three `@deprecated` — *"Models released
after Claude Opus 4.6 do not support setting temperature (only 1.0 accepted) / do not accept top\_k (any
value 400s) / do not support setting top\_p (only ≥0.99 accepted)"* (`messages.d.ts:2116-2121,2218-2227`).
So on the `direct` transport:

- The sampling capability is a RESOLVER fact per model (part 01 §3 curated refinement, `anthropic-direct`
  shape): pre-cutoff models get `{temperature: ANTHROPIC_TEMP_RANGE, topP, topK, stop: true}`
  (Anthropic's temperature range is 0–1, not the OpenAI 0–2 — a distinct `ANTHROPIC_TEMP_RANGE`);
  post-cutoff models get `{}` (the funnel then drops every user knob with the existing
  `sampling_knob_dropped` warning — no 400 possible).
- **Seeding is fail-closed:** every curated entry starts `{}` on the `anthropic-direct` shape; the part
  04 W9 hand-run probe extends the live matrix per model before any entry is opened. The generational
  seam likely matches the prefill matrix (the 4.5-era models honor both; opus-4.8/sonnet-4.6 refuse
  prefill and are post-cutoff for sampling) — but "likely" is not a capability fact; the probe is.
- The unlock is REAL and RP-relevant: the prefill-capable, sampling-capable 4.5-era models are exactly
  the RP-favored ones, selectable on anth-direct via OR slugs. The CLI transport denies sampling to ALL
  of them; `direct` restores it where the wire honors it.
- `seed`/`logitBias`/penalty knobs do NOT exist on the Messages wire — never in this arm's capability.

Contract-side this is ZERO new fields — the existing `sampling` axis, populated per (model ×
`anthropic-direct`) by the resolver (part 01 §3/§4b); applied in the anth-direct runner (part 02 §5c).
