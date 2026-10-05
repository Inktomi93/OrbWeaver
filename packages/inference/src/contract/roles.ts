// The non-chat task requests (embed / rerank / imageEmbed / summarize / structured / generateImage): the
// credential-free call shape from `@orb/contracts/role-clients` plus the dispatcher-bound
// `connection` + `signal`. RESULT shapes live in `@orb/contracts/providers`, not redeclared here.

import type { EndpointFeatures, Task } from "@orb/contracts/inference";
import type { RolePresetParams } from "@orb/contracts/preset";
import type { SummarizeResult } from "@orb/contracts/providers";
import type {
  ImageEmbedInput,
  ImageInput,
  RerankDocument,
  RerankQuery,
  ResponseFormat,
  RoleClients,
  RoleClientTask,
  SummarizeInput,
  SummarizeOptions,
} from "@orb/contracts/role-clients";
import type { ModelId, UserId } from "@orb/kit/ids";
import type { ResolvedWarning } from "./resolve.ts";
import type { Resolved } from "./resolved.ts";

/** The base deadline of one remote embed request when its row states none. */
const DEFAULT_EMBED_REQUEST_TIMEOUT_MS = 120_000;

/** The deadline one remote embed request gets: the row's `requestTimeoutMs`, else the wire default. The openai-compat
 *  wire widens it for a large batch; a single short input gets exactly this. */
export function embedRequestTimeoutMs(features: Pick<EndpointFeatures, "requestTimeoutMs">): number {
  return features.requestTimeoutMs ?? DEFAULT_EMBED_REQUEST_TIMEOUT_MS;
}

/** The tasks that take a request through this file — every task but the two chat-shaped ones. */
type RoleTask = Exclude<Task, "chat" | "agent">;

interface TaskRequestCommon<T extends RoleTask> {
  readonly connection: Resolved<T>;
  readonly signal?: AbortSignal | undefined;
}

/** Text embedding. Empty/whitespace inputs filter to `null` in the result. */
export interface EmbedRequest extends TaskRequestCommon<"embed"> {
  readonly input: string | readonly string[];
  /** Output dimensionality an MRL model is asked for; the funnel decides it from the capability. */
  readonly dimensions?: number | undefined;
  readonly inputType?: "query" | "document" | undefined;
  readonly instruction?: string | undefined;
}

/** ONE embedding as an OpenAI-dialect response spells it: `number[]` under `encoding_format:"float"`, or a
 *  base64 string of packed little-endian float32s. `backends/kit/embedding-decode` is the one reader. */
export type WireEmbedding = number[] | string;

export interface RerankRequest extends TaskRequestCommon<"rerank"> {
  readonly query: RerankQuery;
  readonly instruction?: string | undefined;
  readonly documents: readonly RerankDocument[];
  readonly topN?: number | undefined;
}

export interface ImageEmbedRequest extends TaskRequestCommon<"imageEmbed"> {
  readonly input: ImageEmbedInput;
}

/** One summarization task — an independent (system, user) pair so a batch can vary prompts. */
export interface SummarizeRequestItem {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly images?: readonly ImageInput[] | undefined;
}

/** The per-item params a summarize/structured call carries: the role preset folded over the task posture (D299). The
 *  chat turn each item rides gates them against the model. The backend request names the output cap `maxTokens`. */
export type TaskSampling = Readonly<Omit<RolePresetParams, "maxOutputTokens">> & { readonly maxTokens?: number | undefined };

/** SUMMARIZE IS SUMMARIZATION — a prose task. Schema-constrained generation is the DISTINCT `structured`
 *  task (owner ruling 2026-07-27); this request carries NO `responseFormat`, by type. */
export interface SummarizeRequest extends TaskRequestCommon<"summarize">, TaskSampling {
  readonly inputs: readonly SummarizeRequestItem[];
}

/** The one-shot SCHEMA-CONSTRAINED primitive. Same batch shape as summarize; `responseFormat` REQUIRED. */
export interface StructuredRequest extends TaskRequestCommon<"structured">, TaskSampling {
  readonly inputs: readonly SummarizeRequestItem[];
  readonly responseFormat: ResponseFormat;
}

interface ImageEditInput {
  readonly image?: Uint8Array | string | undefined;
  readonly mask?: Uint8Array | string | undefined;
  readonly references?: readonly (Uint8Array | string)[] | undefined;
}

export interface ImageGenerateRequest extends TaskRequestCommon<"generateImage"> {
  readonly prompt: string;
  /** The generation owner; the runner has no principal, so the owner rides the request. */
  readonly owner?: UserId | undefined;
  readonly systemPrompt?: string | undefined;
  readonly n?: number | undefined;
  readonly negativePrompt?: string | undefined;
  readonly size?: { readonly width: number; readonly height: number } | undefined;
  /** Present ⇒ img2img/edit; stripped-with-warning by the belt when the capability lacks `imageEdit`. */
  readonly edit?: ImageEditInput | undefined;
}

export interface GeneratedImage {
  /** Relative tool/file part order in the original completion, before the result arrays split it. */
  readonly partOrdinal?: number | undefined;
  readonly thoughtSignature?: string | undefined;
  readonly url: string | undefined;
  readonly base64: string | undefined;
  readonly mediaType: string | undefined;
  /** §6.7 INLINE REPLY ONLY — the character offset in the completion's accumulated REPLY TEXT at which this
   *  picture arrived, so the chat reducer can splice its `![alt](asset:id)` span where the model put it
   *  rather than piling every picture at the tail. Absent on the `/imagine` path, which has no prose to
   *  interleave with. A HINT, not a guarantee: the domain's receive tier (regex scripts, the `<think>` demux)
   *  may rewrite those bytes before the splice, so the consumer clamps. */
  readonly atChars?: number | undefined;
}

export interface ImageGenerateResult {
  readonly images: readonly GeneratedImage[];
  readonly model: ModelId;
  readonly usage: { readonly costUsd: number | null };
  readonly warnings: readonly ResolvedWarning[];
}

/** The `RoleClients.summarize` call options as the SERVER sees them: the isomorphic vocabulary plus the
 *  caller's `AbortSignal`. */
export interface SummarizeCallOptions extends SummarizeOptions {
  readonly signal?: AbortSignal | undefined;
}

export interface StructuredCallOptions extends SummarizeCallOptions {
  readonly responseFormat: ResponseFormat;
}

/** The bound `RoleClients` bundle `roleClientsFor(funder, actor?)` mints — the isomorphic contract with the
 *  server's two additions: every call takes an `AbortSignal`, and `resolved(task)` hands back the FULL
 *  `Resolved` (a `ResolvedTaskView` structurally), which stays inside the server. */
export interface RoleClientsWithSignal extends Omit<RoleClients, "summarize" | "structured" | "resolved"> {
  readonly summarize: (inputs: readonly SummarizeInput[], opts?: SummarizeCallOptions) => Promise<SummarizeResult>;
  readonly structured: (inputs: readonly SummarizeInput[], opts: StructuredCallOptions) => Promise<SummarizeResult>;
  readonly resolved: (task: RoleClientTask) => Promise<Resolved | null>;
}
