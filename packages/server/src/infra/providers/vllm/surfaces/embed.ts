// infra/providers/vllm/surfaces/embed — the vLLM TEXT-embed role surface (Qwen3-VL-Embedding).
//
// A THIN shaper over the engine: filter empty inputs to `null` (the EmbedResult contract — the local
// family filters; OpenRouter never emits null), wrap survivors in the cookbook ChatML conversation
// (engine/embedding.toEmbedPrompt — raw text embeds into a worse region of the space), chunk + dispatch
// with bounded concurrency (vLLM does CONTINUOUS batching server-side: moderate per-request arrays × a
// few requests in flight keep its scheduler fed), then MRL-truncate + L2-normalize each vector onto its
// caller position. Registers against engine/ ONLY (the injected client) — it imports no sibling surface.
//
// MRL: we request the OpenAI `dimensions` param; if a pooling combo rejects it we retry full-dim and
// truncate+renormalize client-side (identical result for matryoshka models — see engine/embedding).

import type { EmbedRequest, EmbedResult } from "../../contract";
import type { VllmEngineClient } from "../engine";
import {
  DOC_INSTRUCTION,
  normalizeVector,
  QUERY_INSTRUCTION,
  toEmbedPrompt,
  truncateToDim,
} from "../engine";

// vLLM hard-caps context and REJECTS over-long input with HTTP 400 (it does NOT truncate by default). `-1`
// tells vLLM to truncate to the model's max length using ITS OWN tokenizer — exact, inline, no extra round
// trip; only over-long inputs are touched.
const TRUNCATE_TO_MODEL_MAX = -1;
// A "server rejected the `dimensions` param" message — the trigger for the full-dim client-side fallback.
const DIMENSIONS_REJECTED_RE = /dimensions/i;

/** Deps the embed surface closes over. `embedDim`/`chunkSize`/`concurrency` are injected (the composition
 *  root reads env once; concurrency is a settings-tier knob — see the subsystem FLAG, not env today). */
export interface VllmEmbedDeps {
  readonly client: VllmEngineClient;
  readonly embedDim: number;
  readonly chunkSize: number;
  readonly concurrency: number;
}

// The engine's OpenAI-compatible embeddings response (raw snake_case socket shape).
interface OpenAiEmbeddingsResponse {
  readonly data: ReadonlyArray<{ readonly index: number; readonly embedding: number[] }>;
  readonly model: string;
  readonly usage?: { readonly prompt_tokens?: number; readonly total_tokens?: number } | undefined;
}

// A non-empty input plus its slot in the original request order (empties become `null` vectors).
interface KeptInput {
  readonly index: number;
  readonly prompt: string;
}

// One /v1/embeddings request with the MRL `dimensions` fallback.
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
    return await client.enginePost<OpenAiEmbeddingsResponse>(
      "embed",
      "/v1/embeddings",
      withDim,
      signal,
    );
  } catch (err) {
    // Some vLLM/pooling combos reject `dimensions` — fall back to full-dim + client-side truncation.
    if (err instanceof Error && DIMENSIONS_REJECTED_RE.test(err.message)) {
      const noDim = { model, input: texts, truncate_prompt_tokens: TRUNCATE_TO_MODEL_MAX };
      return await client.enginePost<OpenAiEmbeddingsResponse>(
        "embed",
        "/v1/embeddings",
        noDim,
        signal,
      );
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

// Scatter one chunk's response vectors onto their caller positions; return its token usage (or null).
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
  return response.usage === undefined
    ? null
    : { prompt: response.usage.prompt_tokens ?? 0, total: response.usage.total_tokens ?? 0 };
}

/** Bind the embed role to the engine client + knobs. */
export function createVllmEmbed(deps: VllmEmbedDeps): (req: EmbedRequest) => Promise<EmbedResult> {
  return async (req) => {
    const inputs: readonly string[] = typeof req.input === "string" ? [req.input] : req.input;
    const dim = req.dimensions ?? deps.embedDim;
    // A caller instruction (per-scope query instruction) wins; else the inputType default.
    const instruction =
      req.instruction ?? (req.inputType === "query" ? QUERY_INSTRUCTION : DOC_INSTRUCTION);

    const kept = selectInputs(inputs, instruction);
    const vectors: (Float32Array<ArrayBuffer> | null)[] = new Array(inputs.length).fill(null);
    if (kept.length === 0) {
      return { vectors, model: req.model, usage: { promptTokens: null, totalTokens: null } };
    }

    const chunks: KeptInput[][] = [];
    for (let start = 0; start < kept.length; start += deps.chunkSize) {
      chunks.push(kept.slice(start, start + deps.chunkSize));
    }
    const usages: ({ prompt: number; total: number } | null)[] = new Array(chunks.length).fill(
      null,
    );

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
          signal: req.signal,
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
