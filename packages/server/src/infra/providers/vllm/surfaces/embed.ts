// The vLLM text-embed role surface (Qwen3-VL-Embedding): filters empty inputs to null, CLAMPS each survivor
// to the engine's context window (see THE WINDOW GUARD below — #165), wraps them in the ChatML conversation,
// chunks + dispatches with bounded concurrency, then MRL-truncates + L2-normalizes each vector onto its
// caller position. Requests the OpenAI `dimensions` param; if a pooling combo rejects it, retries full-dim
// and truncates+renormalizes client-side.

import { clampToTokenBudget, estimateTokens, safeTokenWindow } from "@orb/kit/tokens";
import { getLog } from "#foundation/observability";
import type { EmbedRequest, EmbedResult } from "../../contract/index.ts";
import type { VllmEngineClient } from "../engine/index.ts";
import { DOC_INSTRUCTION, fitToDim, normalizeVector, QUERY_INSTRUCTION, toEmbedPrompt } from "../engine/index.ts";

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
 *  four role markers ≈ 30 estimated tokens). The PROPORTIONAL error between the estimate and the engine's real
 *  tokenizer is absorbed separately by `safeTokenWindow` (#187) — a flat reserve cannot cover it. */
const PROMPT_SCAFFOLD_RESERVE_TOKENS = 64;

// THE TRANSPORT BATCH IS BOUNDED, THE FLOOD IS NOT (#187). The owner's batching ruling stands — the caller
// hands us everything at once and we never throttle, interleave, or fall back to per-item calls — but "one
// POST" is not the same promise as "one batch". `chunkSize` counts ITEMS, which says nothing about work: the
// memory sweep's length-sorted segment flood (#172) packed 128 near-window blocks into a single POST of ~1M
// prompt tokens. Two things break at that size, both measured live on the box's embed engine
// (Qwen3-VL-Embedding-2B, max_model_len 8192, 895-chat corpus):
//
//   1. The request outlives any fixed deadline. Four concurrent 128-input POSTs over the corpus's largest
//      blocks completed in 28.0s / 61.2s / 96.7s / 136.8s — the last one past the 120s client bound, on a
//      healthy engine doing honest work (2.07M prompt tokens at ~15.1k tok/s aggregate).
//   2. It HEAD-OF-LINE BLOCKS every other caller. A 29-token POST answered in 59ms against an idle engine and
//      in 72,769ms behind two flood POSTs — which is how the image-index embed died with the same 120s error
//      while nothing was wrong with it.
//
// So a POST is capped by TOKENS as well as items, and the sub-POSTs go out back-to-back at the same worker
// count. That is transport sizing, not client-side throttling: the engine still sees the whole flood, just in
// units its scheduler can interleave with everyone else's work.

/** The conservative embed throughput the per-POST deadline is derived from. Measured on the box's embed engine:
 *  ~12.6k tok/s for a single 128-input POST, ~15.1k tok/s aggregate under 4-way concurrency, and 4.4k tok/s
 *  END-TO-END for the request that waited behind three siblings (the number that matters — it already contains
 *  the queue). 2k tok/s is ~2.2× below that worst case, so a GPU shared with the gen engine still clears the
 *  bound while a genuinely wedged engine still settles. */
const EMBED_FLOOR_TOKENS_PER_SEC = 2000;
const MS_PER_SEC = 1000;

/** The deadline for ONE POST: the configured base (`env.VLLM_EMBED_REQUEST_TIMEOUT_MS`) or the time this
 *  batch's tokens need at the floor throughput, whichever is larger. A fixed constant is the landmine (#187);
 *  this scales with the work actually submitted and is always finite. */
function postDeadlineMs(tokens: number, baseMs: number): number {
  return Math.max(baseMs, Math.ceil((tokens / EMBED_FLOOR_TOKENS_PER_SEC) * MS_PER_SEC));
}

// PER-POST cap so a warming/wedged engine can't hang boot-time embedding forever; a trip maps to a retryable
// ProviderError so the catch-up sweep re-embeds once the engine is up. Correct only because embed is
// non-streaming (chat generation uses a rolling idle guard instead). The BASE value is INJECTED
// (deps.requestTimeoutMs, single-homed at env.VLLM_EMBED_REQUEST_TIMEOUT_MS in createVllmBackend) — no bare
// literal here — and the effective deadline scales up with the batch (`postDeadlineMs`, #187). It was a
// WHOLE-CALL bound before #187, which made a corpus-sized call (16 POSTs, ~6.5M tokens, ~13 min of honest
// engine work) unsatisfiable by construction: the clock covered work the bound was never sized for.

export interface VllmEmbedDeps {
  readonly client: VllmEngineClient;
  readonly embedDim: number;
  readonly chunkSize: number;
  readonly concurrency: number;
  readonly requestTimeoutMs: number;
  /** The per-POST token ceiling — the transport bound the `chunkSize` item count cannot express (#187).
   *  Injected from `env.VLLM_EMBED_MAX_BATCH_TOKENS`. */
  readonly maxBatchTokens: number;
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
  /** The prompt's estimated tokens — measured ONCE here and reused to size both the transport batch and its
   *  deadline (#187). */
  readonly tokens: number;
}

async function embedChunk(
  client: VllmEngineClient,
  opts: { model: string; texts: readonly string[]; dim: number; signal: AbortSignal | undefined; timeoutMs: number },
): Promise<OpenAiEmbeddingsResponse> {
  const { model, texts, dim, signal, timeoutMs } = opts;
  const withDim = {
    model,
    input: texts,
    dimensions: dim,
  };
  try {
    return await client.enginePost<OpenAiEmbeddingsResponse>("embed", "/v1/embeddings", withDim, { signal, timeoutMs });
  } catch (err) {
    // Some vLLM/pooling combos reject `dimensions` — fall back to full-dim + client-side truncation.
    if (err instanceof Error && DIMENSIONS_REJECTED_RE.test(err.message)) {
      const noDim = { model, input: texts };
      return await client.enginePost<OpenAiEmbeddingsResponse>("embed", "/v1/embeddings", noDim, { signal, timeoutMs });
    }
    throw err;
  }
}

/** Pack the kept inputs into POSTs bounded by BOTH the item count (`chunkSize`) and the token ceiling
 *  (`maxBatchTokens`) — see the transport-batch note above. An input that alone exceeds the token ceiling
 *  still gets its own POST: it is already window-clamped, so refusing it would drop content. */
function packBatches(kept: readonly KeptInput[], maxItems: number, maxTokens: number): KeptInput[][] {
  const batches: KeptInput[][] = [];
  let current: KeptInput[] = [];
  let tokens = 0;
  for (const item of kept) {
    if (current.length > 0 && (current.length >= maxItems || tokens + item.tokens > maxTokens)) {
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

/** Keep the non-empty inputs (position preserved) and wrap each in the cookbook ChatML prompt, clamped to the
 *  engine window (see THE WINDOW GUARD above). A clamp is LOGGED — a silently shortened embed would quietly
 *  change what a vector means. */
function selectInputs(inputs: readonly string[], instruction: string, maxInputTokens: number, model: string): KeptInput[] {
  // The window is discounted BEFORE the flat scaffold reserve: the estimate's error against the engine's real
  // tokenizer is proportional, and 6 of the corpus's 30 largest blocks were 400'd at the undiscounted budget
  // (#187 — `safeTokenWindow` carries the measurement).
  const budget = safeTokenWindow(maxInputTokens) - PROMPT_SCAFFOLD_RESERVE_TOKENS;
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
    const prompt = toEmbedPrompt(clamped, instruction);
    kept.push({ index: i, prompt, tokens: estimateTokens(prompt) });
  }
  return kept;
}

function scatter(args: {
  readonly response: OpenAiEmbeddingsResponse;
  readonly chunk: readonly KeptInput[];
  readonly dim: number;
  readonly vectors: (Float32Array<ArrayBuffer> | null)[];
  /** Operator-facing coordinates for a width refusal — the surface + model that produced the payload. */
  readonly prefix: string;
}): { prompt: number; total: number } | null {
  const { response, chunk, dim, vectors, prefix } = args;
  for (const item of response.data) {
    const slot = chunk[item.index];
    if (slot !== undefined) {
      // `fitToDim` truncates a LONGER vector (MRL) and REFUSES a shorter one — see its contract; a vector
      // narrower than the request asked for is a malformed response, not a width to accept into the store.
      vectors[slot.index] = normalizeVector(fitToDim(item.embedding, dim, prefix));
    }
  }
  return response.usage === undefined ? null : { prompt: response.usage.prompt_tokens ?? 0, total: response.usage.total_tokens ?? 0 };
}

export function createVllmEmbed(deps: VllmEmbedDeps): (req: EmbedRequest) => Promise<EmbedResult> {
  return async (req) => {
    const inputs: readonly string[] = typeof req.input === "string" ? [req.input] : req.input;
    const dim = req.dimensions ?? deps.embedDim;
    const instruction = req.instruction ?? (req.inputType === "query" ? QUERY_INSTRUCTION : DOC_INSTRUCTION);

    const kept = selectInputs(inputs, instruction, deps.maxInputTokens, req.model);
    const vectors: (Float32Array<ArrayBuffer> | null)[] = new Array(inputs.length).fill(null);
    if (kept.length === 0) {
      return { vectors, model: req.model, usage: { promptTokens: null, totalTokens: null } };
    }

    const chunks = packBatches(kept, deps.chunkSize, deps.maxBatchTokens);
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
        const response = await embedChunk(deps.client, {
          model: req.model,
          texts: chunk.map((k) => k.prompt),
          dim,
          signal: req.signal,
          // The deadline belongs to THIS POST and is sized by the tokens it carries (#187) — the caller's own
          // abort signal still cancels earlier, and the engine client composes the two.
          timeoutMs: postDeadlineMs(
            chunk.reduce((sum, k) => sum + k.tokens, 0),
            deps.requestTimeoutMs,
          ),
        });
        usages[i] = scatter({ response, chunk, dim, vectors, prefix: `vllm embed (${req.model})` });
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
