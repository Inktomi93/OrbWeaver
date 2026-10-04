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
import type { RolePresetParams } from "#preset";
import type { EmbedResult, ImageEmbedResult, RerankResult, SummarizeResult } from "#providers";

// @typeonly-ok: the wire vocabulary lives in `ResponseFormat` (the type consumers import); the runtime
// schema itself is only referenced in type position here in contracts — infra's wire arms build their
// OWN literal against the shape rather than calling this validator, so the schema stays the type anchor.
/** The structured-output request (D79) — one projection rule (`@orb/kit/json-schema`) fills `schema`, the
 *  same shape every backend's wire arm maps. Never rides `toolChoice` (the two axes are separate). Minted
 *  zod-first as the cross-boundary vocabulary; the caller's zod payload schema stays its runtime validator. A
 *  caller states the schema only: how it goes out, and whether it fits, is the structured plan's (`@orb/inference`). */
export const responseFormatSchema = z.object({
  /** Schema name (OpenAI `json_schema.name`; Anthropic tool name). */
  name: z.string(),
  /** JSON Schema — projected by `projectJsonSchema` (`additionalProperties:false` pinned). The exported TS
   *  type PINS this to {@link WireReady}; the zod stays a loose `z.record` (a type-only anchor — nothing
   *  `.parse`s a `ResponseFormat`, `@typeonly-ok` above). */
  schema: z.record(z.string(), z.unknown()),
  description: z.string().optional(),
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
      /** Permit the same encoder's text tower when it cannot fuse pairs. Absent/false remains strict. */
      allowTextFallback?: boolean | undefined;
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

/** Per-call sampling for `summarize` and `structured`, applied to every input: the generation params a
 *  non-chat role takes from its preset (D299), already folded over the task's posture. A runner drops a knob
 *  the resolved model does not state, with a warning. */
export type SummarizeOptions = RolePresetParams;

/** The options a `structured` call takes: the summarize sampling plus the required schema (D79), carried however the
 *  structured plan picks for the bound model. Structured generation is a distinct task from prose summarization:
 *  the caller names it, nothing sniffs it. */
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
