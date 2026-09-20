// support/factories/role-clients — the ONE scripted `RoleClients` bundle every domain harness injects through
// its `roleClientsFor` seam (inference program §7.5-1b): deterministic vectors, a scripted `summarize` /
// `structured` tape, and a `resolved(task)` read that answers a fixed model per task. A caller with no
// binding is modelled by `resolved` returning `null` for that task (the harness's `unbound` list).

import type { ProviderId } from "@orb/contracts/inference";
import { EMBEDDING_FLOOR, RERANK_FLOOR } from "@orb/contracts/inference";
import type { EmbedResult, ImageEmbedResult, RerankResult, SummarizeResult } from "@orb/contracts/providers";
import type {
  ImageEmbedInput,
  RerankDocument,
  RerankQuery,
  ResolvedTaskView,
  RoleClients,
  RoleClientTask,
  StructuredOptions,
  SummarizeInput,
  SummarizeOptions,
} from "@orb/contracts/role-clients";
import type { ModelId, UserConnectionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { makeCapability, makeGenerationCapability, TEST_CONNECTION_ID } from "./resolved-connection.ts";

export const FAKE_EMBED_MODEL = "test-embed-model";
export const FAKE_IMAGE_EMBED_MODEL = "test-image-embed-model";
export const FAKE_RERANK_MODEL = "test-rerank-model";
export const FAKE_SUMMARIZE_MODEL = "test-summarize-model";
export const FAKE_EMBED_DIM = 1024;

export interface FakeRoleClientControls {
  readonly embed?: RoleClients["embed"] | undefined;
  readonly imageEmbed?: RoleClients["imageEmbed"] | undefined;
  readonly rerank?: RoleClients["rerank"] | undefined;
  readonly summarize?: RoleClients["summarize"] | undefined;
  readonly structured?: RoleClients["structured"] | undefined;
  /** Tasks whose fold ends in `no-connection` — `resolved` answers `null` and the callable throws. */
  readonly unbound?: readonly RoleClientTask[] | undefined;
  /** The summarize/structured model's image-input fact (the caption lens's requirement). Default true. */
  readonly summarizerVision?: boolean | undefined;
  readonly summarizerContextTokens?: number | undefined;
  readonly embedDim?: number | undefined;
  /** The model id `resolved(task)` reports — and, for the default callables, the model id their own reply
   *  stamps. A caller overriding a callable with `embed`/`imageEmbed`/etc. but stamping a DIFFERENT model on
   *  its own reply needs its `resolved().model` to agree, or a model-scoped read (e.g. `requireSpaceModel`)
   *  never finds what was actually stored. Defaults to the `FAKE_*_MODEL` constants. */
  readonly embedModel?: string | undefined;
  readonly imageEmbedModel?: string | undefined;
  readonly rerankModel?: string | undefined;
  readonly summarizeModel?: string | undefined;
  readonly structuredModel?: string | undefined;
}

/** A deterministic unit-ish vector for `text` at `dim` (the index seeds the direction so two inputs differ). */
export function fakeVector(text: string, dim = FAKE_EMBED_DIM, salt = 0): Float32Array<ArrayBuffer> {
  let seed = salt;
  for (let i = 0; i < text.length; i += 1) {
    seed = (seed * 31 + text.charCodeAt(i)) % 1_000_003;
  }
  return Float32Array.from({ length: dim }, (_, i) => ((seed + i * 7919) % 1000) / 1000 - 0.5);
}

function unboundError(task: RoleClientTask): Error {
  return new Error(`fake role clients: ${task} has no connection`);
}

/** The scripted bundle. Every default answers deterministically; override any callable per test. */
export function makeFakeRoleClients(controls: FakeRoleClientControls = {}): RoleClients {
  const unbound = new Set<RoleClientTask>(controls.unbound ?? []);
  const dim = controls.embedDim ?? FAKE_EMBED_DIM;
  const embedModel = controls.embedModel ?? FAKE_EMBED_MODEL;
  const imageEmbedModel = controls.imageEmbedModel ?? FAKE_IMAGE_EMBED_MODEL;
  const rerankModel = controls.rerankModel ?? FAKE_RERANK_MODEL;
  const summarizeModel = controls.summarizeModel ?? FAKE_SUMMARIZE_MODEL;
  const structuredModel = controls.structuredModel ?? FAKE_SUMMARIZE_MODEL;
  const guard = <T extends RoleClientTask>(task: T): void => {
    if (unbound.has(task)) {
      throw unboundError(task);
    }
  };
  const embed: RoleClients["embed"] = (input, _opts): Promise<EmbedResult> => {
    guard("embed");
    const inputs = typeof input === "string" ? [input] : [...input];
    return Promise.resolve({ vectors: inputs.map((t, i) => fakeVector(t, dim, i + 1)), model: embedModel, usage: { promptTokens: null, totalTokens: null } });
  };
  const imageEmbed: RoleClients["imageEmbed"] = (req: ImageEmbedInput): Promise<ImageEmbedResult> => {
    guard("imageEmbed");
    const texts = req.kind === "text" ? (typeof req.input === "string" ? [req.input] : [...req.input]) : [];
    return Promise.resolve({ vectors: texts.map((t, i) => fakeVector(t, dim, i + 101)), model: imageEmbedModel });
  };
  const rerank: RoleClients["rerank"] = (_query: RerankQuery, documents: RerankDocument[]): Promise<RerankResult> => {
    guard("rerank");
    return Promise.resolve({ hits: documents.map((d, i) => ({ id: d.id, score: documents.length - i })), model: rerankModel, usage: { totalTokens: null } });
  };
  const summarize: RoleClients["summarize"] = (inputs: readonly SummarizeInput[], _opts?: SummarizeOptions): Promise<SummarizeResult> => {
    guard("summarize");
    return Promise.resolve({ items: inputs.map(() => ({ text: "", usage: { tokensIn: null, tokensOut: null, costUsd: null } })), model: summarizeModel });
  };
  const structured: RoleClients["structured"] = (inputs: readonly SummarizeInput[], _opts: StructuredOptions): Promise<SummarizeResult> => {
    guard("structured");
    return Promise.resolve({ items: inputs.map(() => ({ text: "{}", usage: { tokensIn: null, tokensOut: null, costUsd: null } })), model: structuredModel });
  };
  const generation = makeCapability(
    makeGenerationCapability({
      input: controls.summarizerVision === false ? ["text"] : ["text", "image"],
      output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"], structured: true },
      context: { window: controls.summarizerContextTokens ?? 32_000 },
    }),
  );
  const views: Record<RoleClientTask, ResolvedTaskView> = {
    embed: view(embedModel, { kind: "embedding", embedding: { ...EMBEDDING_FLOOR, dims: dim, input: ["text"] } }),
    imageEmbed: view(imageEmbedModel, { kind: "embedding", embedding: { ...EMBEDDING_FLOOR, dims: dim, input: ["text", "image"] } }),
    rerank: view(rerankModel, { kind: "rerank", rerank: RERANK_FLOOR }),
    summarize: view(summarizeModel, generation),
    structured: view(structuredModel, generation),
  };
  return {
    embed: controls.embed ?? embed,
    imageEmbed: controls.imageEmbed ?? imageEmbed,
    rerank: controls.rerank ?? rerank,
    summarize: controls.summarize ?? summarize,
    structured: controls.structured ?? structured,
    resolved: (task): Promise<ResolvedTaskView | null> => Promise.resolve(unbound.has(task) ? null : views[task]),
  };
}

function view(model: string, capability: ResolvedTaskView["capability"]): ResolvedTaskView {
  return { model: castId<ModelId>(model), connectionId: TEST_CONNECTION_ID as UserConnectionId, providerId: castId<ProviderId>("custom-openai"), capability };
}
