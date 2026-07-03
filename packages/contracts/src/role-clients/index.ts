// `@orb/contracts/role-clients` — the `RoleClients` composition seam: the bundle of BOUND-CALLABLE
// inference role functions the composition root mints ONCE at boot and threads through every
// consumer's deps. Downstream code never sees a credential literal or picks a model — it calls
// `clients.embed(text)` and gets a result. The GOLD-STANDARD cross-feature hub (the 19 type-only
// importers — corpus / search / chat-memory / buddy / workloads — name it WITHOUT a domain↔domain or
// domain→infra import; core/Tier-3b-Providers.md "keep the bundle"). Ported from neo-tavern
// `domain/_shared/role-clients.ts`.
//
// TYPE-ONLY by nature: a bundle of FUNCTIONS is not wire-serializable, so there are NO zod schemas
// here — only the interface + its credential-free call-argument shapes. The cross-boundary RESULT
// shapes (`EmbedResult` / `RerankResult` / `ImageEmbedResult` / `SummarizeResult`) are imported DOWN
// from `@orb/contracts/providers` (DAG: providers MUST land first — shared-dissolution §8,
// core/Tier-3b-Providers.md §"Contract homes"). This node stays Layer 1: the callables are PRE-BOUND THUNKS
// (no `ResolvedCredential` / `ResolvedConnection` in any signature), so role-clients does NOT pick up
// a `contracts/credentials` or `contracts/connection` edge (contracts-dag role-clients FLAG → resolves
// to L1). The boot binder FILLS the bundle via `connection.resolveRole(role)` per role (Esoteric §2).
//
// D-DEVIATION (shared-dissolution §6): `createDefaultRoleClients` is DELETED — there is no
// family-aware silent default. Every context receives `roleClients` as a REQUIRED `entry/`-wired dep;
// a missing wire is a `tsc` error, not a fallback. Only the TYPE lives here.
//
// CALL-ARGUMENT shapes (`RerankQuery` / `RerankDocument` / `ImageEmbedInput` / `SummarizeInput`) are
// defined HERE, not imported from `contracts/providers`: that node deliberately holds ONLY result
// shapes — the infra REQUEST shapes (which carry `ResolvedCredential` / model id / `AbortSignal`) stay
// infra-internal (`infra/providers/contract/`). The credential-free, model-free portion a consumer
// actually passes IS part of this composition seam, so it is canonical here. `ImageInput` is kept
// lib-clean (`Uint8Array | string`, no node `Buffer`) — `Buffer` is assignable to `Uint8Array`, so no
// caller is lost, and contracts must not assume the node lib (mirrors the providers header).
//
// FLAG (chat / agent / generateImage): contracts-dag describes the EVENTUAL seam as
// `chat/agent/embed/rerank/imageEmbed/summarize/generateImage`, but neo's `RoleClients` artifact (the
// 19-importer surface) carries only the four DERIVE roles, and `@orb/contracts/providers` exposes no
// `ChatResult`/`AgentTurnResult`/`GenerateImageResult` to depend on. A `chat` member cannot be grounded
// at Layer 1 today (its result contract has not landed). The four derive roles below are the
// buildable-now bundle; chat/agent/generateImage join when their result contracts exist. (Lead: confirm
// before wiring a chat member here.)

import type { EmbedResult, ImageEmbedResult, RerankResult, SummarizeResult } from "#providers";

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

/** N-gram repetition guard (vLLM family) — stops a degenerate loop before `maxTokens`. Families that
 *  don't honor it drop it (no-op knob doctrine). */
export interface RepetitionDetection {
  maxPatternSize: number;
  minPatternSize?: number | undefined;
  minCount: number;
}

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
 *  honor a knob drop it silently (cross-family summarize is fire-and-forget for these). */
export interface SummarizeOptions {
  maxTokens?: number | undefined;
  temperature?: number | undefined;
  /** Min-p nucleus floor (vLLM family). */
  minP?: number | undefined;
  /** JSON Schema for constrained output (vLLM family enforces via guided decoding). */
  jsonSchema?: object | undefined;
  repetitionDetection?: RepetitionDetection | undefined;
}

/**
 * Bound-callable role clients — the composition root binds credential + model id ONCE at boot, then
 * threads the callable through every deps bundle. Downstream code never sees a credential literal or
 * picks a model; it calls `clients.embed(text)` and gets a result.
 *
 * One bound callable per role (rather than vendor-by-vendor port objects): tests inject a stub
 * `RoleClients` instead of mocking separate factories, and a future migration to per-user role
 * credentials is a one-site rebind — consumers don't move.
 *
 * The `*Model` fields carry the model id baked into each callable; consumers that store provenance on
 * DB rows (`character_embeddings.model`, `chat_digests.summarizerModel`, …) read it from here.
 */
export interface RoleClients {
  /** Text-embedding. Single string or array — result vectors are index-aligned. `inputType` is the
   *  asymmetric-retrieval hint ("query" vs "document"); symmetric embedders ignore it. */
  embed: (
    input: string | string[],
    opts?: { inputType?: "query" | "document"; instruction?: string },
  ) => Promise<EmbedResult>;
  /** Cross-encoder rerank. Documents carry caller ids; hits preserve them. `opts.instruction` is the
   *  per-task `<Instruct>` for instruction-aware rerankers; text-only families ignore it. */
  rerank: (
    query: RerankQuery,
    documents: RerankDocument[],
    opts?: { instruction?: string },
  ) => Promise<RerankResult>;
  /** Joint image+text embedding (image + text in one shared space). Discriminate via `kind`. */
  imageEmbed: (req: ImageEmbedInput) => Promise<ImageEmbedResult>;
  /** Batched summarization. Returns one item per input; pass non-empty user prompts only. */
  summarize: (inputs: SummarizeInput[], opts?: SummarizeOptions) => Promise<SummarizeResult>;

  /** Model id baked into `embed` — stored on every embedding row's `model` column. */
  embedModel: string;
  /** Model id baked into `rerank` — provenance only (rerank scores aren't persisted long-term). */
  rerankModel: string;
  /** Model id baked into `imageEmbed` — stored on `image_embeddings.model`. */
  imageEmbedModel: string;
  /** Model id baked into `summarize` — stored on `chat_digests.summarizerModel`. */
  summarizerModel: string;
  /** The summarizer model's resolved context window in tokens (`ModelCapability.contextLength`, or a floor
   *  when the catalog reports none). The memory build's TOKEN-GUARD reads this to fit each summarizer call to
   *  the user's ACTUAL context — trim-to-fit / skip-and-flag, never silent truncation (knowledge-cluster §3a/
   *  §10). A summarizer is a `chat`-turn on the user's own backend, so the context is the user's, not a pin. */
  summarizerContextTokens: number;
}
