// The deterministic OFFLINE vLLM engine clients the seeders inject through the sanctioned
// `providerSeams.vllmClient` seam (the same seam the compose int-tests use).
//
// WHY a fake instead of skipping embeddings: `embeddings.store` has no precomputed-vector path — it always
// embeds via `roleClients.embed`. Injecting a scripted engine is what lets the REAL vector write path (and
// the databank chunk→embed pipeline) run credit-free, GPU-free, and byte-stable across runs.
import type { VllmEngineClient } from "@orb/server/infra/providers/vllm/engine";
import type { EmbeddingsBody } from "../contract/types.ts";

const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;
const MULBERRY_INCREMENT = 0x6d2b79f5;
const UINT32_SPAN = 4294967296;
const CENTER_OFFSET = 0.5;
const SCRIPTED_PROMPT_TOKENS = 12;
const SCRIPTED_COMPLETION_TOKENS = 8;
const LOOPBACK_BASE = "http://127.0.0.1:0";

/** A stable [0,1) pseudo-random stream seeded from a string (mulberry32) — same text ⇒ same vector. */
function seededStream(text: string): () => number {
  let a = FNV_OFFSET_BASIS;
  for (let i = 0; i < text.length; i += 1) {
    a ^= text.charCodeAt(i);
    a = Math.imul(a, FNV_PRIME);
  }
  return (): number => {
    a |= 0;
    a = (a + MULBERRY_INCREMENT) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_SPAN;
  };
}

/** A deterministic embedding for `text` of the given dim (centered so L2-normalization keeps it
 *  non-degenerate). */
export function fakeEmbedding(text: string, dim: number): number[] {
  const rand = seededStream(text);
  return Array.from({ length: dim }, () => rand() - CENTER_OFFSET);
}

/** One scripted assistant reply streamed as OpenAI SSE bytes (what the vLLM chat surface drains). */
function scriptedChatSse(reply: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  // OpenAI's snake_case is the WIRE's vocabulary, not ours — spelled as array-literal pairs so the frames
  // stay verbatim without a naming-convention suppression.
  const chunk = (delta: unknown, finishReason: string | null, usage?: unknown): string =>
    `data: ${JSON.stringify(
      Object.fromEntries([
        [
          "choices",
          [
            Object.fromEntries([
              ["delta", delta],
              ["finish_reason", finishReason],
            ]),
          ],
        ],
        ...(usage === undefined ? [] : [["usage", usage] as const]),
      ]),
    )}\n\n`;
  const frames = [
    chunk({ content: reply }, null),
    chunk(
      {},
      "stop",
      Object.fromEntries([
        ["prompt_tokens", SCRIPTED_PROMPT_TOKENS],
        ["completion_tokens", SCRIPTED_COMPLETION_TOKENS],
      ]),
    ),
    "data: [DONE]\n\n",
  ];
  return new ReadableStream<Uint8Array>({
    start(controller): void {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(frame));
      }
      controller.close();
    },
  });
}

const SCRIPTED_REPLY = "Glad to have you here — the Loom is turning steady today. What would you like to explore first?";

export function fakeVllmClient(embedDim: number, defaultModel: string): VllmEngineClient {
  return {
    enginePost: <T>(engine: string, path: string, body: unknown): Promise<T> => {
      if (path.includes("/embeddings")) {
        const b = body as EmbeddingsBody;
        const dim = b.dimensions ?? embedDim;
        const seeds = Array.isArray(b.input) ? b.input : [JSON.stringify(b.messages ?? "")];
        const data = seeds.map((text, index) => ({ index, embedding: fakeEmbedding(String(text), dim) }));
        return Promise.resolve({ data, model: b.model ?? defaultModel } as T);
      }
      return Promise.reject(new Error(`seed demo fake vLLM: unhandled enginePost ${engine} ${path}`));
    },
    engineStream: (): Promise<ReadableStream<Uint8Array>> => Promise.resolve(scriptedChatSse(SCRIPTED_REPLY)),
    baseUrl: (engine: string): string => `${LOOPBACK_BASE}/${engine}`,
  };
}

/** A minimal offline client for a seeder that never generates (the chat fixture synthesizes its
 *  transcript) — createServices still requires the seam, so it rejects loudly instead of pretending. */
export function inertVllmClient(): VllmEngineClient {
  return {
    enginePost: <T>(_engine: string, path: string): Promise<T> => Promise.reject(new Error(`seed chat: no live model (enginePost ${path})`)),
    engineStream: (_engine: string, path: string): Promise<ReadableStream<Uint8Array>> =>
      Promise.reject(new Error(`seed chat: no live model (engineStream ${path})`)),
    baseUrl: (engine: string): string => `${LOOPBACK_BASE}/${engine}`,
  };
}
