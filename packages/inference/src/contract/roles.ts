// The non-chat task requests (embed / rerank / imageEmbed / summarize / structured / generateImage): the
// credential-free call shape from `@orb/contracts/role-clients` plus the dispatcher-bound
// `connection` + `signal`. RESULT shapes live in `@orb/contracts/providers`, not redeclared here.

import type { Task } from "@orb/contracts/inference";
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
import type { UserId } from "@orb/kit/ids";
import type { ResolvedWarning } from "./resolve.ts";
import type { Resolved } from "./resolved.ts";

/** The tasks that take a request through this file — every task but the two chat-shaped ones. */
type RoleTask = Exclude<Task, "chat" | "agent">;

interface TaskRequestCommon<T extends RoleTask> {
  readonly connection: Resolved<T>;
  readonly signal?: AbortSignal | undefined;
}

/** Text embedding. Empty/whitespace inputs filter to `null` in the result. */
export interface EmbedRequest extends TaskRequestCommon<"embed"> {
  readonly input: string | readonly string[];
  /** Output dimensionality (MRL models honour truncation); the funnel decides it from the capability. */
  readonly dimensions?: number | undefined;
  /** CLIENT-SIDE truncation to the space width (a wider non-MRL model); the funnel's other arm. */
  readonly truncateTo?: number | undefined;
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

/** The per-item sampling a summarize/structured call carries — the side-gen posture folded beneath the
 *  purpose-scoped preset (§7.5-3), already resolved. */
export interface SideGenSampling {
  readonly maxTokens?: number | undefined;
  readonly temperature?: number | undefined;
  readonly topP?: number | undefined;
  readonly topK?: number | undefined;
  readonly frequencyPenalty?: number | undefined;
  readonly presencePenalty?: number | undefined;
  readonly repetitionPenalty?: number | undefined;
  readonly minP?: number | undefined;
}

/** SUMMARIZE IS SUMMARIZATION — a prose task. Schema-constrained generation is the DISTINCT `structured`
 *  task (owner ruling 2026-07-27); this request carries NO `responseFormat`, by type. */
export interface SummarizeRequest extends TaskRequestCommon<"summarize">, SideGenSampling {
  readonly inputs: readonly SummarizeRequestItem[];
}

/** The one-shot SCHEMA-CONSTRAINED primitive. Same batch shape as summarize; `responseFormat` REQUIRED. */
export interface StructuredRequest extends TaskRequestCommon<"structured">, SideGenSampling {
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
  readonly url: string | undefined;
  readonly base64: string | undefined;
  readonly mediaType: string | undefined;
}

export interface ImageGenerateResult {
  readonly images: readonly GeneratedImage[];
  readonly model: string;
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
