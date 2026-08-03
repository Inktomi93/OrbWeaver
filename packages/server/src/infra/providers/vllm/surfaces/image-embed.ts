// vLLM joint image+text embed surface (Qwen3-VL-Embedding). Same engine/vector space/dim as text embed
// (one unified multimodal space). Covers modes needing the chat-style `messages` request (images can't
// ride the raw `input` path): "image", "text", "multimodal" (joint image+text in one forward pass).
// `messages` + `add_generation_prompt: true` reproduces the official similarity matrix. Throughput comes
// from `concurrency` requests in flight, merged by the engine's continuous batcher.

import type { ImageEmbedInput, ImageEmbedPair, ImageInput } from "@orb/contracts/role-clients";
import type { ImageEmbedRequest, ImageEmbedResult } from "../../contract/index.ts";
import type { VllmEngineClient } from "../engine/index.ts";
import { DOC_INSTRUCTION, normalizeVector, QUERY_INSTRUCTION, toDataUri, truncateToDim } from "../engine/index.ts";

// A "server rejected the `dimensions` param" message — the trigger for the full-dim fallback.
const DIMENSIONS_REJECTED_RE = /dimensions/i;

/** Deps the image-embed surface closes over. */
export interface VllmImageEmbedDeps {
  readonly client: VllmEngineClient;
  readonly embedDim: number;
  readonly concurrency: number;
}

type ContentPart = { readonly type: "text"; readonly text: string } | { readonly type: "image_url"; readonly image_url: { readonly url: string } };
interface WireMessage {
  readonly role: "system" | "user";
  readonly content: ContentPart[];
}

// The engine's embeddings response (raw snake_case socket shape).
interface OpenAiEmbeddingsResponse {
  readonly data: ReadonlyArray<{ readonly index: number; readonly embedding: number[] }>;
  readonly model: string;
}

// One chat-style embedding conversation: system = instruction, user = the content parts.
function toMessages(instruction: string, content: ContentPart[]): WireMessage[] {
  return [
    { role: "system", content: [{ type: "text", text: instruction }] },
    { role: "user", content },
  ];
}

async function imageParts(img: ImageInput): Promise<ContentPart[]> {
  return [{ type: "image_url", image_url: { url: await toDataUri(img) } }];
}

async function pairParts(pair: ImageEmbedPair): Promise<ContentPart[]> {
  const parts: ContentPart[] = [{ type: "image_url", image_url: { url: await toDataUri(pair.image) } }];
  if (pair.text.trim().length > 0) {
    parts.push({ type: "text", text: pair.text });
  }
  return parts;
}

// Normalize the three input shapes into one list of conversations (null = a filtered/empty slot).
async function toConversations(input: ImageEmbedInput, queryInstruction: string): Promise<(WireMessage[] | null)[]> {
  if (input.kind === "text") {
    const texts = Array.isArray(input.input) ? input.input : [input.input];
    return texts.map((t) => (t.trim().length > 0 ? toMessages(queryInstruction, [{ type: "text", text: t }]) : null));
  }
  if (input.kind === "image") {
    const images = Array.isArray(input.input) ? input.input : [input.input];
    return await Promise.all(images.map(async (img) => toMessages(DOC_INSTRUCTION, await imageParts(img))));
  }
  const pairs = Array.isArray(input.input) ? input.input : [input.input];
  return await Promise.all(pairs.map(async (pair) => toMessages(DOC_INSTRUCTION, await pairParts(pair))));
}

// One messages-shaped /v1/embeddings request with the MRL `dimensions` fallback.
async function embedOne(
  client: VllmEngineClient,
  opts: { model: string; messages: WireMessage[]; dim: number; signal: AbortSignal | undefined },
): Promise<OpenAiEmbeddingsResponse> {
  const { model, messages, dim, signal } = opts;
  const base = { model, add_generation_prompt: true, messages };
  try {
    return await client.enginePost<OpenAiEmbeddingsResponse>("embed", "/v1/embeddings", { ...base, dimensions: dim }, signal);
  } catch (err) {
    if (err instanceof Error && DIMENSIONS_REJECTED_RE.test(err.message)) {
      return await client.enginePost<OpenAiEmbeddingsResponse>("embed", "/v1/embeddings", base, signal);
    }
    throw err;
  }
}

/** Bind the imageEmbed role to the engine client + knobs. */
export function createVllmImageEmbed(deps: VllmImageEmbedDeps): (req: ImageEmbedRequest) => Promise<ImageEmbedResult> {
  return async (req) => {
    const dim = deps.embedDim; // image rides the SAME dim as text (one multimodal space)
    const queryInstruction = req.input.instruction ?? QUERY_INSTRUCTION;
    const conversations = await toConversations(req.input, queryInstruction);

    const vectors: (Float32Array<ArrayBuffer> | null)[] = new Array(conversations.length).fill(null);
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < conversations.length) {
        const i = next;
        next += 1;
        const messages = conversations[i];
        if (messages === undefined) {
          break;
        }
        if (messages === null) {
          continue;
        }
        // biome-ignore lint/performance/noAwaitInLoops: the worker pulls conversations serially; concurrency is the worker COUNT.
        const response = await embedOne(deps.client, {
          model: req.model,
          messages,
          dim,
          signal: req.signal,
        });
        const item = response.data[0];
        if (item !== undefined) {
          vectors[i] = normalizeVector(truncateToDim(item.embedding, dim));
        }
      }
    };
    const workerCount = Math.min(deps.concurrency, conversations.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    return { vectors, model: req.model };
  };
}
