// The vLLM text-embed role surface (Qwen3-VL-Embedding): filters empty inputs to null, wraps survivors in
// the ChatML conversation, chunks + dispatches with bounded concurrency, then MRL-truncates + L2-normalizes
// each vector onto its caller position. Requests the OpenAI `dimensions` param; if a pooling combo rejects
// it, retries full-dim and truncates+renormalizes client-side.

import type { EmbedRequest, EmbedResult } from "../../contract/index.ts";
import type { VllmEngineClient } from "../engine/index.ts";
import { DOC_INSTRUCTION, normalizeVector, QUERY_INSTRUCTION, toEmbedPrompt, truncateToDim } from "../engine/index.ts";

// vLLM rejects over-long input with HTTP 400 by default; `-1` tells it to truncate using its own tokenizer.
const TRUNCATE_TO_MODEL_MAX = -1;
const DIMENSIONS_REJECTED_RE = /dimensions/i;

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
    truncate_prompt_tokens: TRUNCATE_TO_MODEL_MAX,
  };
  try {
    return await client.enginePost<OpenAiEmbeddingsResponse>("embed", "/v1/embeddings", withDim, signal);
  } catch (err) {
    // Some vLLM/pooling combos reject `dimensions` — fall back to full-dim + client-side truncation.
    if (err instanceof Error && DIMENSIONS_REJECTED_RE.test(err.message)) {
      const noDim = { model, input: texts, truncate_prompt_tokens: TRUNCATE_TO_MODEL_MAX };
      return await client.enginePost<OpenAiEmbeddingsResponse>("embed", "/v1/embeddings", noDim, signal);
    }
    throw err;
  }
}

function selectInputs(inputs: readonly string[], instruction: string): KeptInput[] {
  const kept: KeptInput[] = [];
  for (let i = 0; i < inputs.length; i += 1) {
    const text = inputs[i] ?? "";
    if (text.trim().length > 0) {
      kept.push({ index: i, prompt: toEmbedPrompt(text, instruction) });
    }
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

    const kept = selectInputs(inputs, instruction);
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
