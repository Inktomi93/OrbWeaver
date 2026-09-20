// support/factories/role-clients — the ONE scripted `RoleClients` bundle every domain harness injects through
// its `roleClientsFor` seam (inference program §7.5-1b): deterministic vectors, a scripted `summarize` /
// `structured` tape, and a `resolved(task)` read that answers a fixed model per task. A caller with no
// binding is modelled by `resolved` returning `null` for that task (the harness's `unbound` list).

import type { EmbedResult, ImageEmbedInput, ImageEmbedResult, RerankDocument, RerankQuery, RerankResult, SummarizeInput, SummarizeResult } from "@orb/contracts/providers";
import type { ResolvedTaskView, RoleClientTask, RoleClients, StructuredOptions, SummarizeOptions } from "@orb/contracts/role-clients";
import type { ProviderId } from "@orb/contracts/inference";
import { EMBEDDING_FLOOR, RERANK_FLOOR } from "@orb/contracts/inference";
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
}

/** A deterministic unit-ish vector for `text` at `dim` (the index seeds the direction so two inputs differ). */
export function fakeVector(text: string, dim = FAKE_EMBED_DIM, salt = 0): number[] {
  let seed = salt;
  for (let i = 0; i < text.length; i += 1) {
    seed = (seed * 31 + text.charCodeAt(i)) % 1_000_003;
  }
  return Array.from({ length: dim }, (_, i) => ((seed + i * 7919) % 1000) / 1000 - 0.5);
}

function unboundError(task: RoleClientTask): Error {
  return new Error(`fake role clients: ${task} has no connection`);
}

/** The scripted bundle. Every default answers deterministically; override any callable per test. */
export function makeFakeRoleClients(controls: FakeRoleClientControls = {}): RoleClients {
  const unbound = new Set<RoleClientTask>(controls.unbound ?? []);
  const dim = controls.embedDim ?? FAKE_EMBED_DIM;
  const guard = <T extends RoleClientTask>(task: T): void => {
    if (unbound.has(task)) {
      throw unboundError(task);
    }
  };
  const embed: RoleClients["embed"] = (input, _opts): Promise<EmbedResult> => {
    guard("embed");
    const inputs = typeof input === "string" ? [input] : [...input];
    return Promise.resolve({ vectors: inputs.map((t, i) => fakeVector(t, dim, i + 1)), model: FAKE_EMBED_MODEL, usage: { promptTokens: null, totalTokens: null } });
  };
  const imageEmbed: RoleClients["imageEmbed"] = (req: ImageEmbedInput): Promise<ImageEmbedResult> => {
    guard("imageEmbed");
    const texts = req.kind === "text" ? (typeof req.input === "string" ? [req.input] : [...req.input]) : [];
    return Promise.resolve({ vectors: texts.map((t, i) => fakeVector(t, dim, i + 101)), model: FAKE_IMAGE_EMBED_MODEL });
  };
  const rerank: RoleClients["rerank"] = (_query: RerankQuery, documents: RerankDocument[]): Promise<RerankResult> => {
    guard("rerank");
    return Promise.resolve({ hits: documents.map((d, i) => ({ id: d.id, score: documents.length - i })), model: FAKE_RERANK_MODEL, usage: { totalTokens: null } });
  };
  const summarize: RoleClients["summarize"] = (inputs: readonly SummarizeInput[], _opts?: SummarizeOptions): Promise<SummarizeResult> => {
    guard("summarize");
    return Promise.resolve({ items: inputs.map(() => ({ text: "", usage: { tokensIn: null, tokensOut: null, costUsd: null } })), model: FAKE_SUMMARIZE_MODEL });
  };
  const structured: RoleClients["structured"] = (inputs: readonly SummarizeInput[], _opts: StructuredOptions): Promise<SummarizeResult> => {
    guard("structured");
    return Promise.resolve({ items: inputs.map(() => ({ text: "{}", usage: { tokensIn: null, tokensOut: null, costUsd: null } })), model: FAKE_SUMMARIZE_MODEL });
  };
  const generation = makeCapability(
    makeGenerationCapability({
      input: controls.summarizerVision === false ? ["text"] : ["text", "image"],
      output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"], structured: true },
      context: { window: controls.summarizerContextTokens ?? 32_000 },
    }),
  );
  const views: Record<RoleClientTask, ResolvedTaskView> = {
    embed: view(FAKE_EMBED_MODEL, { kind: "embedding", embedding: { ...EMBEDDING_FLOOR, dims: dim, input: ["text"] } }),
    imageEmbed: view(FAKE_IMAGE_EMBED_MODEL, { kind: "embedding", embedding: { ...EMBEDDING_FLOOR, dims: dim, input: ["text", "image"] } }),
    rerank: view(FAKE_RERANK_MODEL, { kind: "rerank", rerank: RERANK_FLOOR }),
    summarize: view(FAKE_SUMMARIZE_MODEL, generation),
    structured: view(FAKE_SUMMARIZE_MODEL, generation),
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
