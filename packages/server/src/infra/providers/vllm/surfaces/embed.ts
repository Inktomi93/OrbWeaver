// The vLLM text-embed role surface (Qwen3-VL-Embedding): filters empty inputs to null, CLAMPS each survivor
// to the engine's context window (see THE WINDOW GUARD below — #165), wraps them in the ChatML conversation,
// chunks + dispatches with bounded concurrency, then MRL-truncates + L2-normalizes each vector onto its
// caller position. Requests the OpenAI `dimensions` param; if a pooling combo rejects it, retries full-dim
// and truncates+renormalizes client-side.

import { clampToTokenBudget } from "@orb/kit/tokens";
import { getLog } from "#foundation/observability";
import type { EmbedRequest, EmbedResult } from "../../contract/index.ts";
import type { VllmEngineClient } from "../engine/index.ts";
import { DOC_INSTRUCTION, normalizeVector, QUERY_INSTRUCTION, toEmbedPrompt, truncateToDim } from "../engine/index.ts";

const DIMENSIONS_REJECTED_RE = /dimensions/i;

// THE WINDOW GUARD IS CLIENT-SIDE (#165). This surface used to send `truncate_prompt_tokens: -1` and let the
// engine cut an over-long prompt with its own tokenizer. Probed live against the box's embed engine
// (Qwen3-VL-Embedding-2B, max_model_len 8192) on 2026-08-17, that knob is worse than the 400 it was added to
// avoid: a 43,340-char input sent WITH it never returns (>30s probe; the production bound is 120s and the
// engine logs no request at all — zero GPU activity), while the SAME input sent WITHOUT it is refused in
// 21ms with an honest "maximum context length is 8192 tokens" 400. That hang WAS the memory backfill's
// ~2-minute-per-chat plan failure: `generateSegments` embedded a whole aged-out block verbatim, and the seven
// chats whose blocks ran 36k–200k chars each burned one 120s timeout. (The rerank surface reproduced the
// identical failure on its own engine — #173.)
//
// So: clamp here (`@orb/kit/tokens.clampToTokenBudget` — the one home for the cut), and ask the engine for
// NOTHING. The clamp keeps the request inside the window (no 400 in practice), and if the estimate ever
// undershoots the engine's real tokenizer the request fails FAST and LOUD instead of pinning a worker for
// two minutes — the failure mode we can afford.
//
// THE CLAMP IS A BELT, NOT A POLICY (owner ruling, #165): truncating MEMORY-FEEDING content is a no-go —
// "if we are skimping out on messages that's a no go since this feeds the memory system". The memory
// segment build therefore never reaches this clamp: it measures each verbatim block against the same window
// (`blockFitsEmbedWindow`) and SKIPS an oversized block whole, recorded. What survives here is the last
// resort for every OTHER caller (already-chunked databank text, the window-capped card projection, queries),
// where a head-clamped vector beats a hung worker. A clamp on a memory input would be a bug upstream, which
// is why the clamp LOGS every time it fires.

/** Tokens held back for the ChatML scaffold `toEmbedPrompt` wraps every input in (system instruction + the
 *  four role markers ≈ 30 estimated tokens) plus slack for tokenizer disagreement on the clamp boundary. */
const PROMPT_SCAFFOLD_RESERVE_TOKENS = 64;

// Whole-request cap so a warming/wedged engine can't hang boot-time embedding forever; a trip maps to a
// retryable ProviderError so the catch-up sweep re-embeds once the engine is up. Correct only because
// embed is non-streaming (chat generation uses a rolling idle guard instead). The value is INJECTED
// (deps.requestTimeoutMs, single-homed at env.VLLM_EMBED_REQUEST_TIMEOUT_MS in createVllmBackend) — no bare
// literal here.

function embedRequestSignal(external: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return external === undefined ? timeout : AbortSignal.any([external, timeout]);
}

export interface VllmEmbedDeps {
  readonly client: VllmEngineClient;
  readonly embedDim: number;
  readonly chunkSize: number;
  readonly concurrency: number;
  readonly requestTimeoutMs: number;
  /** The embed engine's context window — the SAME value that launches it (`--max-model-len`), injected from
   *  `env.VLLM_EMBED_MAX_MODEL_LEN` in `createVllmBackend` so the clamp and the engine can't drift. */
  readonly maxInputTokens: number;
}

interface OpenAiEmbeddingsResponse {
  readonly data: ReadonlyArray<{ readonly index: number; readonly embedding: number[] }>;
  readonly model: string;
  readonly usage?: { readonly prompt_tokens?: number; readonly total_tokens?: number } | undefined;
}

interface KeptInput {
  readonly index: number;
  readonly prompt: string;
}

async function embedChunk(
  client: VllmEngineClient,
  opts: { model: string; texts: readonly string[]; dim: number; signal: AbortSignal | undefined },
): Promise<OpenAiEmbeddingsResponse> {
  const { model, texts, dim, signal } = opts;
  const withDim = {
    model,
    input: texts,
    dimensions: dim,
  };
  try {
    return await client.enginePost<OpenAiEmbeddingsResponse>("embed", "/v1/embeddings", withDim, signal);
  } catch (err) {
    // Some vLLM/pooling combos reject `dimensions` — fall back to full-dim + client-side truncation.
    if (err instanceof Error && DIMENSIONS_REJECTED_RE.test(err.message)) {
      const noDim = { model, input: texts };
      return await client.enginePost<OpenAiEmbeddingsResponse>("embed", "/v1/embeddings", noDim, signal);
    }
    throw err;
  }
}

/** Keep the non-empty inputs (position preserved) and wrap each in the cookbook ChatML prompt, clamped to the
 *  engine window (see THE WINDOW GUARD above). A clamp is LOGGED — a silently shortened embed would quietly
 *  change what a vector means. */
function selectInputs(inputs: readonly string[], instruction: string, maxInputTokens: number, model: string): KeptInput[] {
  const budget = maxInputTokens - PROMPT_SCAFFOLD_RESERVE_TOKENS;
  const kept: KeptInput[] = [];
  for (let i = 0; i < inputs.length; i += 1) {
    const text = inputs[i] ?? "";
    if (text.trim().length === 0) {
      continue;
    }
    const clamped = clampToTokenBudget(text, budget);
    if (clamped.length !== text.length) {
      getLog().warn(
        { provider: true, backend: "vllm", event: "provider.embed-clamped", model, index: i, chars: text.length, clampedToChars: clamped.length, budget },
        "vllm embed: input exceeds the engine window — clamped to fit (the tail is not embedded)",
      );
    }
    kept.push({ index: i, prompt: toEmbedPrompt(clamped, instruction) });
  }
  return kept;
}

function scatter(
  response: OpenAiEmbeddingsResponse,
  chunk: readonly KeptInput[],
  dim: number,
  vectors: (Float32Array<ArrayBuffer> | null)[],
): { prompt: number; total: number } | null {
  for (const item of response.data) {
    const slot = chunk[item.index];
    if (slot !== undefined) {
      vectors[slot.index] = normalizeVector(truncateToDim(item.embedding, dim));
    }
  }
  return response.usage === undefined ? null : { prompt: response.usage.prompt_tokens ?? 0, total: response.usage.total_tokens ?? 0 };
}

export function createVllmEmbed(deps: VllmEmbedDeps): (req: EmbedRequest) => Promise<EmbedResult> {
  return async (req) => {
    const inputs: readonly string[] = typeof req.input === "string" ? [req.input] : req.input;
    const dim = req.dimensions ?? deps.embedDim;
    const signal = embedRequestSignal(req.signal, deps.requestTimeoutMs);
    const instruction = req.instruction ?? (req.inputType === "query" ? QUERY_INSTRUCTION : DOC_INSTRUCTION);

    const kept = selectInputs(inputs, instruction, deps.maxInputTokens, req.model);
    const vectors: (Float32Array<ArrayBuffer> | null)[] = new Array(inputs.length).fill(null);
    if (kept.length === 0) {
      return { vectors, model: req.model, usage: { promptTokens: null, totalTokens: null } };
    }

    const chunks: KeptInput[][] = [];
    for (let start = 0; start < kept.length; start += deps.chunkSize) {
      chunks.push(kept.slice(start, start + deps.chunkSize));
    }
    const usages: ({ prompt: number; total: number } | null)[] = new Array(chunks.length).fill(null);

    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < chunks.length) {
        const i = next;
        next += 1;
        const chunk = chunks[i];
        if (chunk === undefined) {
          break;
        }
        // biome-ignore lint/performance/noAwaitInLoops: the worker pulls chunks serially; concurrency is the worker COUNT.
        const response = await embedChunk(deps.client, {
          model: req.model,
          texts: chunk.map((k) => k.prompt),
          dim,
          signal,
        });
        usages[i] = scatter(response, chunk, dim, vectors);
      }
    };
    const workerCount = Math.min(deps.concurrency, chunks.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    const seen = usages.filter((u): u is { prompt: number; total: number } => u !== null);
    const usage =
      seen.length === 0
        ? { promptTokens: null, totalTokens: null }
        : {
            promptTokens: seen.reduce((a, u) => a + u.prompt, 0),
            totalTokens: seen.reduce((a, u) => a + u.total, 0),
          };
    return { vectors, model: req.model, usage };
  };
}
