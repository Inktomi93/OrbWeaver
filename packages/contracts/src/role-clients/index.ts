// `@orb/contracts/role-clients` — the `RoleClients` composition seam: the bundle of BOUND-CALLABLE
// inference role functions the composition root mints ONCE at boot and threads through every
// consumer's deps. Downstream code never sees a credential literal or picks a model — it calls
// `clients.embed(text)` and gets a result.
// Mostly type-only: a bundle of functions isn't wire-serializable. The ONE exception is
// `responseFormatSchema`/`ResponseFormat` (D79) — the structured-output request vocabulary, minted
// zod-first HERE (not infra) because the summarize role's domain-facing options carry it and `contracts`
// cannot import infra (the package cake); the infra wire arms + `AgentTurnRequest` + `SummarizeOptions`
// import it DOWN. Call-argument shapes (`RerankQuery`/`ImageEmbedInput`/`SummarizeInput`) live here rather
// than `contracts/providers` because that node holds only result shapes; the infra request shapes stay
// infra-internal.
// FLAG: only the four DERIVE roles below are buildable — chat/agent/generateImage join when their
// result contracts land (confirm with lead before wiring a chat member here).

import type { ModelId, UserConnectionId } from "@orb/kit/ids";
import type { WireReady } from "@orb/kit/json-schema";
import { z } from "zod";
import type { Capability, ProviderId } from "#inference";
import type { EmbedResult, ImageEmbedResult, RerankResult, SummarizeResult } from "#providers";

/** WHICH WIRE VEHICLE a structured-output request rides on a backend that has more than one. Minted here
 *  beside `ResponseFormat` because it is a property of the structured-output REQUEST; the AppSettings tier
 *  imports it DOWN for the deployment default (`structuredOutputVehicle`), and it composes with — never
 *  entangles with — the D126 `structuredOutputShape` axis (shape = how we spell an optional; vehicle = which
 *  endpoint feature carries the schema).
 *
 *  Only OpenRouter has a choice to make; vLLM has one enforcing wire (`response_format` + guided decoding)
 *  and ignores this knob.
 *  • `auto` — the DEFAULT: `response-format` when the resolved model's capability says the endpoint supports
 *    structured output, else `forced-tool`. Resolved ONCE, statically, off `capability.output.structured` at
 *    `entry/compose/role-clients.ts`'s `resolveVehicle` — there is NO runtime retry: a 400 on the chosen
 *    vehicle is returned to the caller, deliberately. (An earlier revision of this line claimed "a 400 on the
 *    first falls back to the second for that call". No such fallback was ever built, and the compose site's
 *    own comment states the opposite as the decision — "the backend's own 400 is the honest answer rather
 *    than a silent downgrade to an unenforced wire". Corrected 2026-08-14; a real fallback would be a
 *    behaviour change on every hosted structured call, i.e. a feature ask, not a repair.)
 *  • `response-format` — force `response_format: {type:"json_schema"}` + `strict` + provider
 *    `require_parameters`. Measured 2026-08-09 (23 live OpenRouter calls) as servable on anthropic-,
 *    openai- and google-family endpoints for a schema in the all-required shape. The schema-forge asks for
 *    this per call: an author designing a schema wants the hard guarantee, not a deployment posture.
 *  • `forced-tool` — force the single-forced-tool vehicle (the 2026-08-02 shape). Servable everywhere,
 *    compiles no grammar, and stays the fallback arm — nothing was ripped out. */
export const STRUCTURED_OUTPUT_VEHICLES = ["auto", "response-format", "forced-tool"] as const;
export type StructuredOutputVehicle = (typeof STRUCTURED_OUTPUT_VEHICLES)[number];
export const structuredOutputVehicleSchema = z.enum(STRUCTURED_OUTPUT_VEHICLES);

// @typeonly-ok: the wire vocabulary lives in `ResponseFormat` (the type consumers import); the runtime
// schema itself is only referenced in type position here in contracts — infra's wire arms build their
// OWN literal against the shape rather than calling this validator, so the schema stays the type anchor.
/** The structured-output request (D79) — one projection rule (`@orb/kit/json-schema`) fills `schema`, the
 *  same shape every backend's wire arm maps. Never rides `toolChoice` (the two axes are separate). Minted
 *  zod-first as the cross-boundary vocabulary; the caller's zod payload schema stays its runtime validator. */
export const responseFormatSchema = z.object({
  /** Schema name (OpenAI `json_schema.name`; Anthropic tool name). */
  name: z.string(),
  /** JSON Schema — projected by `projectJsonSchema` (`additionalProperties:false` pinned). The exported TS
   *  type PINS this to {@link WireReady}; the zod stays a loose `z.record` (a type-only anchor — nothing
   *  `.parse`s a `ResponseFormat`, `@typeonly-ok` above). */
  schema: z.record(z.string(), z.unknown()),
  /** Grammar STRICTNESS, opt-in: absent = the BACKEND's own default, and each backend owns that call
   *  (Tier-3b — "each backend internalizes ALL its own quirks"). This used to read "Default true", and every
   *  wire arm honored it by inventing `strict:true` for callers who never asked; on OpenAI-family models
   *  through OpenRouter that is a hard 400 ("'required' is required to be supplied"), because the ONE
   *  projection rule emits optional-by-construction schemas and OpenAI strict demands every property be
   *  required. The OpenRouter chat arms now OMIT it unless set; the enforcing wires (vLLM guided decoding,
   *  where a strict grammar is the whole point) still default it on. Set it explicitly to pin either. */
  strict: z.boolean().optional(),
  description: z.string().optional(),
  /** Per-CALL wire-vehicle request (see {@link STRUCTURED_OUTPUT_VEHICLES}). Absent = the deployment's
   *  `structuredOutputVehicle` governs. Backends with one wire ignore it. */
  vehicle: structuredOutputVehicleSchema.optional(),
});
/** `schema` is PINNED to {@link WireReady} (the rest rides the zod infer): only `projectJsonSchema` output
 *  can fill it, so a raw/stored/unprojected schema at any structured-output send-site fails to typecheck —
 *  the compile-time enforcement of task #41's wire-closure convention. */
export type ResponseFormat = Omit<z.infer<typeof responseFormatSchema>, "schema"> & { schema: WireReady };

/** Image bytes or a filesystem path. Lib-clean: `Uint8Array | string` (a node `Buffer` IS a
 *  `Uint8Array`, so it still satisfies this; `string` = a path the image family reads). */
export type ImageInput = Uint8Array | string;

/** The query side of a rerank — a plain string, or text / image / combo for multimodal rerankers
 *  (Qwen3-VL-Reranker). Text-only families score on `text` and ignore `image` (no-op knob doctrine). */
export type RerankQuery = string | { text?: string | undefined; image?: ImageInput | undefined };

/** One rerank document: a CALLER-supplied id (not an array index — results stay stable across
 *  reorderings) plus at least one of text / image. */
export interface RerankDocument {
  id: string;
  text?: string | undefined;
  image?: ImageInput | undefined;
}

/** A joint image+text pair embedded into ONE vector (e.g. a card PNG plus its caption); only
 *  natively-multimodal families honor it. */
export interface ImageEmbedPair {
  image: ImageInput;
  text: string;
}

/** The credential-free call argument for `imageEmbed` — `Omit<ImageEmbedRequest, "credential" | "model" | "signal">`
 *  from the infra request, re-expressed as the cross-boundary input. Discriminate
 *  via `kind`: image-side / text-side (text→image search) / joint multimodal. `instruction` is the
 *  per-task hint for instruction-aware families; others ignore it. */
export type ImageEmbedInput =
  | { kind: "image"; input: ImageInput | ImageInput[]; instruction?: string | undefined }
  | { kind: "text"; input: string | string[]; instruction?: string | undefined }
  | {
      kind: "multimodal";
      input: ImageEmbedPair | ImageEmbedPair[];
      instruction?: string | undefined;
    };

/** One summarization task — an independent (system, user) pair so a batch can vary prompts. The
 *  credential-free counterpart of the infra `SummarizeRequestItem`. */
export interface SummarizeInput {
  systemPrompt: string;
  userPrompt: string;
  /** Optional image(s) on the user turn — vision-capable families attach them; text-only families
   *  ignore them. Bytes or a filesystem path. */
  images?: ImageInput[] | undefined;
}

/** Per-call sampling overrides for `summarize` — applied uniformly to every input; runners that can't
 *  honor a knob drop it silently (cross-family summarize is fire-and-forget for these). The penalty/nucleus
 *  set MIRRORS the generate path's sampler knobs so a summarize request can carry the
 *  SAME loop-controls a chat request does — critically `presencePenalty`, which the memory build defaults to a
 *  loop-stopping value for repetition_penalty=1.0 models (Qwen3-VL). A family that can't honor a knob drops it. */
export interface SummarizeOptions {
  maxTokens?: number | undefined;
  temperature?: number | undefined;
  /** Nucleus top-p (vLLM / OpenAI-compatible families). */
  topP?: number | undefined;
  /** Top-k truncation (vLLM family). */
  topK?: number | undefined;
  /** OpenAI-style frequency penalty. */
  frequencyPenalty?: number | undefined;
  /** OpenAI-style presence penalty — the summarize loop-guard for repetition_penalty=1.0 models (Qwen3-VL). */
  presencePenalty?: number | undefined;
  /** Multiplicative repetition penalty (vLLM family; 1 = no penalty). */
  repetitionPenalty?: number | undefined;
  /** Min-p nucleus floor (vLLM family). */
  minP?: number | undefined;
}

/** The options a `structured` call takes: the summarize sampling PLUS the REQUIRED schema constraint (D79 —
 *  the wire enforces it: vLLM guided decoding, OpenAI/OR `response_format`, the agent-sdk `outputFormat`, or the
 *  forced-tool vehicle when the deployment says so). Structured generation is a DISTINCT task from prose
 *  summarization (owner ruling 2026-07-27; inference program §7.5-1): the caller NAMES it, nothing sniffs it. */
export interface StructuredOptions extends SummarizeOptions {
  responseFormat: ResponseFormat;
}

/** The tasks a `RoleClients` bundle serves — the derive roles; chat/agent/generateImage reach the executor
 *  through their own doors. `structured` RIDES the `summarize` binding (F4 — one Model-roles slot). */
export const ROLE_CLIENT_TASKS = ["embed", "rerank", "imageEmbed", "summarize", "structured"] as const;
export type RoleClientTask = (typeof ROLE_CLIENT_TASKS)[number];

/** What a task resolves to RIGHT NOW for the bundle's funder — model, capability and connection id in ONE
 *  object (inference program §7.5-1b: replaces the six per-role getters). The credential never rides. */
export interface ResolvedTaskView {
  readonly model: ModelId;
  readonly connectionId: UserConnectionId;
  readonly providerId: ProviderId;
  readonly capability: Capability;
}

/** The per-FUNDER role-client bundle `roleClientsFor(funder, actor?)` mints: every callable resolves its task
 *  through the binding fold AT CALL TIME (a re-pointed binding governs the very next call), names its task at
 *  the call site, and never exposes a credential or a provider id. `resolved(task)` is the one read of WHAT a
 *  task resolves to — `null` when the fold ends in `no-connection`. */
export interface RoleClients {
  /** Text-embedding. Single string or array — result vectors are index-aligned. `inputType` is the
   *  asymmetric-retrieval hint ("query" vs "document"); symmetric embedders ignore it. */
  embed: (input: string | readonly string[], opts?: { inputType?: "query" | "document"; instruction?: string }) => Promise<EmbedResult>;
  /** Cross-encoder rerank. Documents carry caller ids; hits preserve them. `opts.instruction` is the
   *  per-task `<Instruct>` for instruction-aware rerankers; text-only families ignore it. */
  rerank: (query: RerankQuery, documents: RerankDocument[], opts?: { instruction?: string }) => Promise<RerankResult>;
  /** Joint image+text embedding (image + text in one shared space). Discriminate via `kind`. */
  imageEmbed: (req: ImageEmbedInput) => Promise<ImageEmbedResult>;
  /** Batched PROSE summarization. Returns one item per input; pass non-empty user prompts only. */
  summarize: (inputs: readonly SummarizeInput[], opts?: SummarizeOptions) => Promise<SummarizeResult>;
  /** Batched SCHEMA-CONSTRAINED generation — the one-shot structured primitive; `responseFormat` REQUIRED. */
  structured: (inputs: readonly SummarizeInput[], opts: StructuredOptions) => Promise<SummarizeResult>;
  /** What `task` resolves to for this bundle's funder right now, or `null` (`no-connection`). */
  resolved: (task: RoleClientTask) => Promise<ResolvedTaskView | null>;
}
