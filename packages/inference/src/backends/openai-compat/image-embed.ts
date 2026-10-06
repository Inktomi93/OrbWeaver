// The joint image+text embed task on the openai-compat wire — a plain `POST /v1/embeddings` with the
// chat-style `messages` body (vLLM's documented multimodal embedding request: images cannot ride the raw
// `input` path; `add_generation_prompt: true` reproduces the official similarity matrix). Served only when
// the resolved embedding capability declares `input ∋ image` (`connectionTasks` + `requirementMet` decide
// at resolve, re-asserted here). Same space, same width as the text task (one unified multimodal space): the
// connection's stated `dims`.

import { canEmbedImages } from "@orb/contracts/inference";
import type { ImageEmbedResult } from "@orb/contracts/providers";
import type { ImageEmbedInput, ImageEmbedPair } from "@orb/contracts/role-clients";
import { z } from "zod";
import { ProviderError } from "../../contract/errors.ts";
import type { ImageEmbedRequest } from "../../contract/roles.ts";
import { embeddingCostOf } from "../kit/embedding-cost.ts";
import { decodeEmbeddingVector } from "../kit/embedding-decode.ts";
import { DOC_INSTRUCTION, fitToDim, QUERY_INSTRUCTION } from "../kit/embedding-input.ts";
import { authHeaders, fetchJson, openAiPath } from "../kit/fetch-json.ts";
import type { NormalizeImageBytes } from "../kit/image-normalize.ts";
import { toImageUrl } from "../kit/image-normalize.ts";
import { resolvedScrubSet } from "../kit/sanitize.ts";

const DIMENSIONS_REJECTED_RE = /dimensions/iu;
const EMBEDDINGS_PATH = "/embeddings";

export interface ImageEmbedDeps {
  readonly fetch: typeof fetch;
  readonly normalize: NormalizeImageBytes;
}

type ContentPart = { readonly type: "text"; readonly text: string } | { readonly type: "image_url"; readonly image_url: { readonly url: string } };
interface WireMessage {
  readonly role: "system" | "user";
  readonly content: ContentPart[];
}
const embeddingsResponseSchema = z
  .object({
    data: z.array(z.object({ index: z.number(), embedding: z.union([z.array(z.number()), z.string()]) }).loose()),
    model: z.string().min(1).nullish(),
    usage: z.object({ prompt_tokens: z.number().int().nonnegative().nullish(), total_tokens: z.number().int().nonnegative().nullish() }).nullish().catch(null),
  })
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

async function observeImageBatch(req: ImageEmbedRequest, response: EmbeddingsResponse): Promise<void> {
  const textOnly = req.input.kind === "text";
  await req.embeddingAccounting?.recordBatch({
    inputCount: 1,
    inputModalities: textOnly ? ["text"] : ["image", "text"],
    servedModel: response.model ?? null,
    usage: { promptTokens: response.usage?.prompt_tokens ?? null, totalTokens: response.usage?.total_tokens ?? null },
    tokenDetails: null,
    cost: embeddingCostOf(response.usage?.prompt_tokens ?? null, req.connection.features.pricing, null, textOnly),
  });
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
  const { dims: dim, mrl } = connection.capability.embedding;
  const conversations = await toConversations(req.input, deps.normalize);
  const vectors: (Float32Array<ArrayBuffer> | null)[] = new Array(conversations.length).fill(null);
  const reported: EmbeddingsResponse["usage"][] = [];
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
      await observeImageBatch(req, response);
      reported.push(response.usage);
      const item = response.data[0];
      if (item !== undefined) {
        vectors[i] = fitToDim(Array.from(decodeEmbeddingVector(item.embedding, label)), { dims: dim, mrl }, label);
      }
    }
  };
  const workerCount = Math.min(connection.features.concurrency?.imageEmbed ?? 1, conversations.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  const promptTokens =
    reported.length > 0 && reported.every((usage) => typeof usage?.prompt_tokens === "number")
      ? reported.reduce((sum, usage) => sum + (usage?.prompt_tokens ?? 0), 0)
      : null;
  const totalTokens =
    reported.length > 0 && reported.every((usage) => typeof usage?.total_tokens === "number")
      ? reported.reduce((sum, usage) => sum + (usage?.total_tokens ?? 0), 0)
      : null;
  return { vectors, model: connection.model, usage: { promptTokens, totalTokens } };
}
