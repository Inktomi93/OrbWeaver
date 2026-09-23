// The text-embed task on the openai-compat wire — an `EmbeddingModelV4.doEmbed` per POST, with the measured
// controls the vLLM surface paid for kept as CODE keyed off the resolved capability:
//   • THE WINDOW GUARD IS CLIENT-SIDE (#165): every input is clamped to `capability.embedding.maxInputTokens`
//     (discounted by `safeTokenWindow` — the estimate's error is proportional) and the engine is asked for
//     NOTHING; a `truncate_prompt_tokens` knob converts an over-window input into an unbounded hang. A clamp
//     is LOGGED — a silently shortened embed quietly changes what a vector means.
//   • THE TRANSPORT BATCH IS BOUNDED BY TOKENS AS WELL AS ITEMS (#187): `features.embedBatch.maxTokens` caps
//     a POST; the deadline scales with the tokens it carries at `floorTokensPerSec`.
//   • the `dimensions` REJECTION fallback: a pooling combo that 400s on the MRL knob is re-asked without it and
//     the vector is truncated client-side (`fitToDim` refuses a NARROWER one — #1635).
//   • the ChatML scaffold when the capability says `promptScaffold: "chatml"` (Qwen3-VL-Embedding); the
//     query/document instructions when `instructionAware`.
// Empty inputs filter to `null` (the `EmbedResult` contract); vectors land L2-normalized (the same primitive
// local-light uses — the local↔hosted swap needs byte-identical norms).

import type { EmbeddingModelV4, JSONObject } from "@ai-sdk/provider";
import type { EmbeddingCapability } from "@orb/contracts/inference";
import type { EmbedResult } from "@orb/contracts/providers";
import { clampToTokenBudget, estimateTokens, safeTokenWindow } from "@orb/kit/tokens";
import { l2Normalize } from "@orb/kit/vector-math";
import { ProviderError } from "../../contract/errors.ts";
import type { Resolved } from "../../contract/resolved.ts";
import type { EmbedRequest } from "../../contract/roles.ts";
import type { InferenceLog } from "../../deps.ts";
import { foldAbortInto } from "../kit/abort-flatten.ts";
import { providerErrorFromHttp } from "../kit/error-classify.ts";
import { providerLogger } from "../kit/provider-log.ts";
import { resolvedScrubSet } from "../kit/sanitize.ts";
import type { ModelCall, TransportDeps } from "./model.ts";
import { embeddingModelFor } from "./model.ts";

/** Cookbook instructions (Qwen3-VL-Embedding, asymmetric retrieval). */
export const DOC_INSTRUCTION = "Represent the user's input.";
export const QUERY_INSTRUCTION = "Retrieve images or text relevant to the user's query.";

const DIMENSIONS_REJECTED_RE = /dimensions/iu;
const PROMPT_SCAFFOLD_RESERVE_TOKENS = 64;
const DEFAULT_CHUNK_ITEMS = 128;
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const MS_PER_SEC = 1000;

export interface EmbedDeps {
  readonly log: InferenceLog;
  readonly transport: TransportDeps;
}

interface KeptInput {
  readonly index: number;
  readonly prompt: string;
  readonly tokens: number;
}

/** The ChatML conversation Qwen3-VL-Embedding was trained on. */
function toChatMlPrompt(text: string, instruction: string): string {
  return `<|im_start|>system\n${instruction}<|im_end|>\n<|im_start|>user\n${text}<|im_end|>\n<|im_start|>assistant\n`;
}

function requireEmbedding(connection: Resolved, label: string): EmbeddingCapability {
  if (connection.capability.kind !== "embedding") {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `${label}: the connection's model is a ${connection.capability.kind} model, not an embedding model`,
    });
  }
  return connection.capability.embedding;
}

/** MRL truncation down; a REFUSAL for a narrower vector (#1635 — padding invents coordinates). */
export function fitToDim(vec: readonly number[], dim: number | undefined, prefix: string): Float32Array<ArrayBuffer> {
  if (dim !== undefined && vec.length < dim) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `${prefix}: the model returned a ${vec.length}-wide vector, narrower than the ${dim} the space admits`,
    });
  }
  const sliced = dim !== undefined && vec.length > dim ? vec.slice(0, dim) : vec;
  return l2Normalize(Float32Array.from(sliced)) as Float32Array<ArrayBuffer>;
}

/** The prompt one input embeds as: the scaffold + instruction the capability says the model was trained on. */
function promptFor(text: string, req: EmbedRequest, capability: EmbeddingCapability): string {
  const instruction = req.instruction ?? (req.inputType === "query" ? QUERY_INSTRUCTION : DOC_INSTRUCTION);
  if (capability.promptScaffold === "chatml") {
    return toChatMlPrompt(text, instruction);
  }
  return capability.instructionAware && req.instruction !== undefined ? `${req.instruction} ${text}` : text;
}

function selectInputs(
  inputs: readonly string[],
  req: EmbedRequest,
  capability: EmbeddingCapability,
  warn: (index: number, chars: number, clamped: number, budget: number) => void,
): KeptInput[] {
  const budget = safeTokenWindow(capability.maxInputTokens) - PROMPT_SCAFFOLD_RESERVE_TOKENS;
  const kept: KeptInput[] = [];
  for (let i = 0; i < inputs.length; i += 1) {
    const text = inputs[i] ?? "";
    if (text.trim().length === 0) {
      continue;
    }
    const clamped = clampToTokenBudget(text, budget);
    if (clamped.length !== text.length) {
      warn(i, text.length, clamped.length, budget);
    }
    const prompt = promptFor(clamped, req, capability);
    kept.push({ index: i, prompt, tokens: estimateTokens(prompt) });
  }
  return kept;
}

/** Pack the kept inputs into POSTs bounded by BOTH the item count and the token ceiling. An input that alone
 *  exceeds the ceiling still gets its own POST: it is already window-clamped, refusing it would drop content. */
function packBatches(kept: readonly KeptInput[], maxItems: number, maxTokens: number | undefined): KeptInput[][] {
  const batches: KeptInput[][] = [];
  let current: KeptInput[] = [];
  let tokens = 0;
  for (const item of kept) {
    const overTokens = maxTokens !== undefined && tokens + item.tokens > maxTokens;
    if (current.length > 0 && (current.length >= maxItems || overTokens)) {
      batches.push(current);
      current = [];
      tokens = 0;
    }
    current.push(item);
    tokens += item.tokens;
  }
  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
}

interface EmbedOnceArgs {
  readonly call: ModelCall;
  readonly model: EmbeddingModelV4;
  readonly values: readonly string[];
  readonly dimensions: number | undefined;
  readonly key: string;
  readonly signal: AbortSignal;
}

async function embedOnce(args: EmbedOnceArgs): Promise<{ readonly embeddings: number[][]; readonly tokens: number | undefined }> {
  const options = (dims: number | undefined): JSONObject => (dims !== undefined ? { dimensions: dims } : {});
  const run = async (dims: number | undefined): Promise<{ readonly embeddings: number[][]; readonly tokens: number | undefined }> => {
    const result = await args.model.doEmbed({ values: [...args.values], abortSignal: args.signal, providerOptions: { [args.key]: options(dims) } });
    return { embeddings: result.embeddings, tokens: result.usage?.tokens };
  };
  try {
    return await run(args.dimensions);
  } catch (err) {
    // Some vLLM/pooling combos reject `dimensions` — fall back to full width + client-side truncation.
    if (args.dimensions !== undefined && err instanceof Error && DIMENSIONS_REJECTED_RE.test(err.message)) {
      return await run(undefined);
    }
    throw err;
  }
}

function postDeadlineMs(tokens: number, base: number | undefined, floorTokensPerSec: number | undefined): number {
  const baseMs = base ?? DEFAULT_REQUEST_TIMEOUT_MS;
  return floorTokensPerSec === undefined ? baseMs : Math.max(baseMs, Math.ceil((tokens / floorTokensPerSec) * MS_PER_SEC));
}

/** The per-POST deadline composed with the caller's cancel — reason-flattened, never `AbortSignal.any`. */
function postSignal(external: AbortSignal | undefined, deadlineMs: number): { readonly signal: AbortSignal; readonly dispose: () => void } {
  const controller = new AbortController();
  const detach = foldAbortInto(controller, external);
  const timer = setTimeout(() => controller.abort(), deadlineMs);
  return {
    signal: controller.signal,
    dispose: (): void => {
      clearTimeout(timer);
      detach();
    },
  };
}

interface BatchRun {
  readonly req: EmbedRequest;
  readonly call: ModelCall;
  readonly model: EmbeddingModelV4;
  readonly label: string;
  readonly secrets: ReturnType<typeof resolvedScrubSet>;
  readonly dimensions: number | undefined;
  readonly fitDim: number | undefined;
  readonly vectors: (Float32Array<ArrayBuffer> | null)[];
}

/** ONE POST: the deadline sized by the batch's tokens, the count asserted, every vector fitted into its slot. */
async function runBatch(run: BatchRun, batch: readonly KeptInput[]): Promise<number | undefined> {
  const { req, call, model, label, secrets } = run;
  const { features } = req.connection;
  const tokens = batch.reduce((sum, item) => sum + item.tokens, 0);
  const post = postSignal(req.signal, postDeadlineMs(tokens, features.requestTimeoutMs, features.embedBatch?.floorTokensPerSec));
  try {
    const result = await embedOnce({
      call,
      model,
      values: batch.map((item) => item.prompt),
      dimensions: run.dimensions,
      key: req.connection.providerId,
      signal: post.signal,
    }).catch((err: unknown) => {
      throw err instanceof ProviderError ? err : providerErrorFromHttp(err, label, secrets);
    });
    if (result.embeddings.length !== batch.length) {
      throw new ProviderError({
        kind: "invalid",
        retryable: false,
        message: `${label}: embedding count does not match the inputs — expected ${batch.length}, got ${result.embeddings.length}`,
      });
    }
    for (const [j, vec] of result.embeddings.entries()) {
      const slot = batch[j];
      if (slot !== undefined) {
        run.vectors[slot.index] = fitToDim(vec, run.fitDim, label);
      }
    }
    return result.tokens;
  } finally {
    post.dispose();
  }
}

export async function runOpenAiCompatEmbed(req: EmbedRequest, deps: EmbedDeps): Promise<EmbedResult> {
  const { connection } = req;
  const label = `${connection.providerId} embed (${connection.model})`;
  const capability = requireEmbedding(connection, label);
  const log = providerLogger(deps.log, connection.wire, connection.providerId);
  const inputs: readonly string[] = typeof req.input === "string" ? [req.input] : req.input;
  const kept = selectInputs(inputs, req, capability, (index, chars, clampedToChars, budget) =>
    log.emit("warn", "provider.embed-clamped", { model: connection.model, index, chars, clampedToChars, budget }),
  );
  const vectors: (Float32Array<ArrayBuffer> | null)[] = new Array(inputs.length).fill(null);
  if (kept.length === 0) {
    return { vectors, model: connection.model, usage: { promptTokens: null, totalTokens: null } };
  }
  const isOpenRouter = connection.provider.dialect === "openrouter";
  const call: ModelCall = {
    connection,
    deps: deps.transport,
    label,
    api: "embed",
    plan: null,
    prefillAllowed: false,
    foldSameRole: false,
    replyImages: false,
    warnings: [],
    ...(isOpenRouter && req.dimensions !== undefined ? { extraBody: { dimensions: req.dimensions } } : {}),
  };
  const model = embeddingModelFor(call);
  const maxPerCall = (await Promise.resolve(model.maxEmbeddingsPerCall)) ?? DEFAULT_CHUNK_ITEMS;
  const batches = packBatches(kept, Math.min(maxPerCall, DEFAULT_CHUNK_ITEMS), connection.features.embedBatch?.maxTokens);
  const run: BatchRun = {
    req,
    call,
    model,
    label,
    secrets: resolvedScrubSet(connection),
    dimensions: isOpenRouter ? undefined : req.dimensions,
    fitDim: req.dimensions ?? req.truncateTo,
    vectors,
  };
  const usages: (number | undefined)[] = new Array(batches.length).fill(undefined);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let i = next; i < batches.length; i = next) {
      next += 1;
      const batch = batches[i];
      if (batch !== undefined) {
        usages[i] = await runBatch(run, batch);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(connection.features.concurrency?.embed ?? 1, batches.length) }, () => worker()));
  const seen = usages.filter((u): u is number => u !== undefined);
  const totalTokens = seen.length === 0 ? null : seen.reduce((a, b) => a + b, 0);
  return { vectors, model: connection.model, usage: { promptTokens: totalTokens, totalTokens } };
}
