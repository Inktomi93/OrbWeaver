// The joint image+text embed task on the openai-compat wire — a plain `POST /v1/embeddings` with the
// chat-style `messages` body (vLLM's documented multimodal embedding request: images cannot ride the raw
// `input` path; `add_generation_prompt: true` reproduces the official similarity matrix). Served only when
// the resolved embedding capability declares `input ∋ image` (`connectionTasks` + `requirementMet` decide
// at resolve, re-asserted here). Same space, same dim as the text task (one unified multimodal space).

import { canEmbedImages } from "@orb/contracts/inference";
import type { ImageEmbedResult } from "@orb/contracts/providers";
import type { ImageEmbedInput, ImageEmbedPair } from "@orb/contracts/role-clients";
import { z } from "zod";
import { ProviderError } from "../../contract/errors.ts";
import type { ImageEmbedRequest } from "../../contract/roles.ts";
import { decodeEmbeddingVector } from "../kit/embedding-decode.ts";
import { authHeaders, fetchJson, openAiPath } from "../kit/fetch-json.ts";
import type { NormalizeImageBytes } from "../kit/image-normalize.ts";
import { resolvedScrubSet } from "../kit/sanitize.ts";
import { toImageUrl } from "../v4/batch.ts";
import { DOC_INSTRUCTION, fitToDim, QUERY_INSTRUCTION } from "./embed.ts";

const DIMENSIONS_REJECTED_RE = /dimensions/iu;
const EMBEDDINGS_PATH = "/embeddings";

export interface ImageEmbedDeps {
  readonly fetch: typeof fetch;
  readonly normalize: NormalizeImageBytes;
  readonly spaceDims: number;
}

type ContentPart = { readonly type: "text"; readonly text: string } | { readonly type: "image_url"; readonly image_url: { readonly url: string } };
interface WireMessage {
  readonly role: "system" | "user";
  readonly content: ContentPart[];
}
const embeddingsResponseSchema = z
  .object({ data: z.array(z.object({ index: z.number(), embedding: z.union([z.array(z.number()), z.string()]) }).loose()) })
  .loose();
type EmbeddingsResponse = z.infer<typeof embeddingsResponseSchema>;

function toMessages(instruction: string, content: ContentPart[]): WireMessage[] {
  return [
    { role: "system", content: [{ type: "text", text: instruction }] },
    { role: "user", content },
  ];
}

async function pairParts(pair: ImageEmbedPair, normalize: NormalizeImageBytes): Promise<ContentPart[]> {
  const parts: ContentPart[] = [{ type: "image_url", image_url: { url: await toImageUrl(pair.image, normalize) } }];
  if (pair.text.trim().length > 0) {
    parts.push({ type: "text", text: pair.text });
  }
  return parts;
}

/** The three input shapes → one list of conversations (`null` = a filtered/empty slot). */
async function toConversations(input: ImageEmbedInput, normalize: NormalizeImageBytes): Promise<(WireMessage[] | null)[]> {
  const queryInstruction = input.instruction ?? QUERY_INSTRUCTION;
  if (input.kind === "text") {
    const texts = Array.isArray(input.input) ? input.input : [input.input];
    return texts.map((text) => (text.trim().length > 0 ? toMessages(queryInstruction, [{ type: "text", text }]) : null));
  }
  if (input.kind === "image") {
    const images = Array.isArray(input.input) ? input.input : [input.input];
    return await Promise.all(
      images.map(async (image) => toMessages(DOC_INSTRUCTION, [{ type: "image_url", image_url: { url: await toImageUrl(image, normalize) } }])),
    );
  }
  const pairs = Array.isArray(input.input) ? input.input : [input.input];
  return await Promise.all(pairs.map(async (pair) => toMessages(DOC_INSTRUCTION, await pairParts(pair, normalize))));
}

interface PostArgs {
  readonly req: ImageEmbedRequest;
  readonly deps: ImageEmbedDeps;
  readonly label: string;
  readonly messages: WireMessage[];
  readonly dim: number;
}

async function embedOne(args: PostArgs): Promise<EmbeddingsResponse> {
  const { req, deps, label, messages } = args;
  const { connection } = req;
  const post = (body: Record<string, unknown>): Promise<EmbeddingsResponse> =>
    fetchJson({
      fetch: deps.fetch,
      url: openAiPath(connection.baseUrl ?? "", EMBEDDINGS_PATH),
      method: "POST",
      headers: authHeaders(connection.credential.secret, connection.transport?.headers),
      body,
      secrets: resolvedScrubSet(connection),
      label,
      ...(req.signal !== undefined ? { signal: req.signal } : {}),
    }).then((result) => embeddingsResponseSchema.parse(result.json));
  const base = { model: connection.model, add_generation_prompt: true, messages };
  try {
    return await post({ ...base, dimensions: args.dim });
  } catch (err) {
    if (err instanceof Error && DIMENSIONS_REJECTED_RE.test(err.message)) {
      return await post(base);
    }
    throw err;
  }
}

export async function runOpenAiCompatImageEmbed(req: ImageEmbedRequest, deps: ImageEmbedDeps): Promise<ImageEmbedResult> {
  const { connection } = req;
  const label = `${connection.providerId} imageEmbed (${connection.model})`;
  if (connection.capability.kind !== "embedding" || !canEmbedImages(connection.capability.embedding)) {
    throw new ProviderError({ kind: "invalid", retryable: false, message: `${label}: the connection's model does not embed images` });
  }
  if (connection.baseUrl === null) {
    throw new ProviderError({ kind: "invalid", retryable: false, message: `${label}: the connection carries no base URL` });
  }
  const dim = deps.spaceDims;
  const conversations = await toConversations(req.input, deps.normalize);
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
      const response = await embedOne({ req, deps, label, messages, dim });
      const item = response.data[0];
      if (item !== undefined) {
        vectors[i] = fitToDim(Array.from(decodeEmbeddingVector(item.embedding, label)), dim, label);
      }
    }
  };
  const workerCount = Math.min(connection.features.concurrency?.imageEmbed ?? 1, conversations.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return { vectors, model: connection.model };
}
