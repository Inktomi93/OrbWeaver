// `EndpointFeatures` — the CHAT body/stream quirk schema that replaces every server-named code path on the
// `openai-compat` wire (§8.1b). A provider row ships its servers' defaults, a connection overrides any field
// in `declared.features`, the transport reads the FOLDED block and never a provider id. There is no `vllm`
// dialect: vLLM is a row whose `features` say `prefill: continue-final-message`, `strictJson: default-on`,
// a sleep/wake path pair and a rerank path.
//
// SCOPE, HONESTLY: this is the chat quirk schema plus the three fan-out/deadline knobs the non-chat surfaces
// read. The non-chat surfaces' MEASURED behaviours (the ChatML wrap, the `dimensions` retry, the #165/#173
// window clamps, the `<think>` strip) stay CODE keyed off the resolved capability — a feature is a knob a
// server dials, not a behaviour a wire carries.
//
// HOMED IN CONTRACTS, NOT THE PACKAGE: `BELT_OWNED_BODY_KEYS` has a live CLIENT reader (the Extras editor
// greys the belt keys) and `@orb/inference` is node-only.

import { z } from "zod";

/** How a delivered trailing-assistant row is continued on this server. `continue-final-message` = vLLM's
 *  `continue_final_message: true` + `add_generation_prompt: false` pair; `deliver` = send the row and hope;
 *  `none` = the server has no continuation arm. Honoured only when the capability says
 *  `turns.assistantPrefill`. */
export const PREFILL_MODES = ["continue-final-message", "deliver", "none"] as const;
export type PrefillMode = (typeof PREFILL_MODES)[number];

/** When `response_format: { type: "json_schema", strict }` rides. `default-on` = vLLM guided decoding
 *  (today's `strictByDefault`); `declared-only` = only when the caller's `ResponseFormat.strict` says so;
 *  `never`. */
export const STRICT_JSON_MODES = ["default-on", "declared-only", "never"] as const;
export type StrictJsonMode = (typeof STRICT_JSON_MODES)[number];

/** How a generic effort level is spelled on this server's wire, if at all. */
export const EFFORT_SPELLINGS = ["reasoning_effort", "none"] as const;
export type EffortSpelling = (typeof EFFORT_SPELLINGS)[number];

/** Which image-generation arm the server exposes: the images API (`imageModel(id)` against
 *  `/v1/images/generations` + `/edits`) or chat-with-image-output (`modalities: ["text","image"]`). */
export const IMAGE_ARMS = ["images-api", "chat-modalities"] as const;
export type ImageArm = (typeof IMAGE_ARMS)[number];

/** How the output cap is spelled on this server's chat-completions body. The SDK writes `max_tokens`;
 *  OpenAI's reasoning models 400 on it (`unsupported_parameter … Use 'max_completion_tokens'`, measured
 *  2026-09-20 on gpt-5-mini) and every current OpenAI chat model takes the new word, so the `openai` row
 *  declares it and the body shaper renames. Absent ⇒ the SDK's spelling stands. */
export const OUTPUT_CAP_FIELDS = ["max_tokens", "max_completion_tokens"] as const;
export type OutputCapField = (typeof OUTPUT_CAP_FIELDS)[number];

export const endpointFeaturesSchema = z.object({
  prefill: z.enum(PREFILL_MODES).optional(),
  strictJson: z.enum(STRICT_JSON_MODES).optional(),
  effort: z.enum(EFFORT_SPELLINGS).optional(),
  outputCapField: z.enum(OUTPUT_CAP_FIELDS).optional(),
  images: z.enum(IMAGE_ARMS).optional(),
  /** A rerank endpoint path relative to `baseUrl` (vLLM `/rerank`); absent ⇒ the wire serves no rerank. */
  rerankPath: z.string().optional(),
  /** The sleep/wake pair a server exposes (vLLM `/is_sleeping` + `/wake_up`). Set ⇒ a sleeping server reads
   *  AVAILABLE and is woken before the request; unset ⇒ sleeping IS down. */
  sleep: z.object({ isSleepingPath: z.string(), wakePath: z.string() }).optional(),
  /** The measured vLLM interlock (§8.1, verify6 M2): a CONTENT prefill with thinking on ⇒ an empty reply, so
   *  the transport strips the thinking toggle on a prefill turn with `reasoning_dropped_for_prefill`. A row
   *  that leaves it unset gets the raw behaviour — the honest default for an unmeasured server. */
  prefillSuppressesThinking: z.boolean().optional(),
  /** The stream-delta field(s) the server puts reasoning in, read IN ORDER. vLLM ships
   *  `["reasoning", "reasoning_content"]` (0.26 renamed it; a `reasoning_content`-only read silently dropped
   *  every reasoning token, live-verified 2026-08-10). Applied by the transport's chunk reshaper. */
  reasoningKeys: z.array(z.string().min(1)).optional(),
  /** Feeds the `estimated` cost arm when the wire reports no usage cost (§5.3c). */
  pricing: z.object({ inputPerMTok: z.number().nonnegative(), outputPerMTok: z.number().nonnegative() }).optional(),
  /** Fan-out caps — THREE, one per surface that takes a `concurrency` dep. Wire default 4/8. NO env key. */
  concurrency: z
    .object({
      embed: z.number().int().positive().optional(),
      imageEmbed: z.number().int().positive().optional(),
      summarize: z.number().int().positive().optional(),
    })
    .optional(),
  /** The #187 per-POST token ceiling + derived deadline on embed: item-count batching alone let a 128-item
   *  POST reach ~1M tokens and head-of-line-block every other caller. Server-specific, so a feature. */
  embedBatch: z.object({ maxTokens: z.number().int().positive(), floorTokensPerSec: z.number().positive() }).optional(),
  /** The deadline base for every NON-CHAT POST on the row (today only the embed POST carried one — a stated
   *  widening, pinned per surface). */
  requestTimeoutMs: z.number().int().positive().optional(),
});
export type EndpointFeatures = z.infer<typeof endpointFeaturesSchema>;

/** The wire's own defaults — what a row that says nothing gets. Today's `vllm/index.ts:52-53` fan-out. */
export const WIRE_DEFAULT_FEATURES: EndpointFeatures = {
  concurrency: { embed: 4, imageEmbed: 4, summarize: 8 },
};

/** Fold `wire default ← provider row ← connection.declared` field-wise: the connection's server is the
 *  truth, then the provider's shipped defaults, then the wire's. Field-wise means a row that sets only
 *  `prefill` keeps the provider's `sleep`. */
export function foldFeatures(...layers: readonly (EndpointFeatures | undefined)[]): EndpointFeatures {
  let folded: EndpointFeatures = { ...WIRE_DEFAULT_FEATURES };
  for (const layer of layers) {
    if (layer !== undefined) {
      folded = { ...folded, ...layer, concurrency: { ...folded.concurrency, ...layer.concurrency } };
    }
  }
  return folded;
}

/** The request-body keys the wire OWNS on every endpoint we build the body for — a key here in a
 *  connection's `extras` is DROPPED with `custom_parameters_ignored{key}`, never merged (D143(b)/D156,
 *  unchanged — F21). EIGHT keys, each with its failure written down:
 *    `truncate_prompt_tokens` / `truncation_side` — the engine-side truncation that #165 measured as an
 *      unbounded hang; the belt clamps client-side instead.
 *    `stream` / `stream_options` — the stream reducer's contract with the wire.
 *    `model` — the resolved connection's identity (window math, cost attribution, the catalog).
 *    `messages` — the assembled canon.
 *    `continue_final_message` / `add_generation_prompt` — the prefill pair: a stray value folds the next turn
 *      into the previous message or 400s outright; under `features.prefill` they are infra-owned.
 *  Moved here from `contracts/preset::VLLM_BELT_OWNED_PARAMETER_KEYS` with `extras` (§8.1c). */
export const BELT_OWNED_BODY_KEYS = [
  "truncate_prompt_tokens",
  "truncation_side",
  "stream",
  "stream_options",
  "model",
  "messages",
  "continue_final_message",
  "add_generation_prompt",
] as const;
export type BeltOwnedBodyKey = (typeof BELT_OWNED_BODY_KEYS)[number];

const BELT_OWNED_BODY_KEY_SET: ReadonlySet<string> = new Set<string>(BELT_OWNED_BODY_KEYS);

export function isBeltOwnedBodyKey(key: string): key is BeltOwnedBodyKey {
  return BELT_OWNED_BODY_KEY_SET.has(key);
}
