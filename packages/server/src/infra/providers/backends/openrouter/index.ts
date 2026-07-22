// biome-ignore-all lint/performance/noBarrelFile: the openrouter FAMILY barrel — the sealed seam `entry/`
// uses to obtain the backend factory + the diagnostic verbs (catalog-fetch / account / probe), and the
// surface the family's tests import (deep imports into `backends/openrouter/<file>` are RED for everyone
// else by the `providers-public-surface-only` cruiser rule). Load-bearing for the encapsulation invariant.

// The stateless remote chat backend + the non-chat roles OpenRouter serves (embed/rerank/imageEmbed/
// generateImage) + the summarize shaper over chat. No `runAgentTurn` (agent mode is agent-sdk's).

import type { ChatContentItems, ChatUserMessageContent, ChatRequest as SdkChatRequest } from "@openrouter/sdk/models";
import type {
  AccountCredits,
  AccountCreditsRequest,
  ChatRequest,
  ChatResult,
  CredentialHealth,
  EmbedRequest,
  EmbedResult,
  FetchCatalogRequest,
  GenerationCost,
  GenerationCostRequest,
  ImageEmbedRequest,
  ImageEmbedResult,
  ImageGenerateRequest,
  ImageGenerateResult,
  ModelCatalogEntry,
  OpenRouterChatRequest,
  ProbeRequest,
  ProviderBackend,
  RerankRequest,
  RerankResult,
  SummarizeRequest,
  SummarizeRequestItem,
  SummarizeResult,
} from "../../contract";
import { ProviderError } from "../../contract";
import type { NormalizeImageBytes } from "../kit";
import { extractChatReply, parseChatCompletionResult, passthroughImageNormalizer } from "../kit";
import { getOpenRouterCredits, getOpenRouterGenerationCost } from "./account";
import { fetchOrCatalog } from "./catalog";
import type { OrClient } from "./client";
import { createClientCache } from "./client";
import { requireOpenRouterApiKey } from "./credential-guard";
import { probeOpenRouterCredential } from "./probe";
import { runChatCompletionTurn } from "./runners/chat/chat-completions";
import { runResponsesTurn } from "./runners/chat/responses";
import type { OpenRouterChatDeps } from "./runners/chat/shared";
import { buildChatResponseFormat } from "./runners/chat/shared";
import { runEmbed } from "./runners/embed/runner";
import { runGenerateImage, runImageEmbed, toImageUrl } from "./runners/image/runner";
import { runRerank } from "./runners/rerank/runner";

export { getOpenRouterCredits, getOpenRouterGenerationCost } from "./account";
export { fetchOrCatalog } from "./catalog";
export type { OrClient } from "./client";
export { createClientCache, createOpenRouterClient } from "./client";
export { requireOpenRouterApiKey } from "./credential-guard";
export { probeOpenRouterCredential } from "./probe";
export {
  placeHistoryCacheBreakpoint,
  runChatCompletionTurn,
} from "./runners/chat/chat-completions";
export { withContextCompressionPlugin } from "./runners/chat/context-compression";
export { runResponsesTurn } from "./runners/chat/responses";
export {
  buildChatResponseFormat,
  buildHistoryMessages,
  buildReasoningRequest,
  buildSystemMessage,
  buildToolChoice,
  buildWireTools,
  chatSamplingFields,
  isMandatoryReasoningRejection,
  mergeCustomParameters,
  reshapeChatStreamChunk,
  resolveFallbackModels,
  resolveProviderPreferences,
} from "./runners/chat/shared";
export { runEmbed } from "./runners/embed/runner";
export { runGenerateImage, runImageEmbed } from "./runners/image/runner";
export { runRerank } from "./runners/rerank/runner";

const SYSTEM_ROLE = "system";
const USER_ROLE = "user";
const TEXT_PART_TYPE = "text";
const IMAGE_PART_TYPE = "image_url";
// The summary text must never carry `<think>…</think>` scaffolding.
const THINK_BLOCK_RE = /<think>[\s\S]*?<\/think>/g;

// One summarize item → the user message content. No images ⇒ the plain-string content, byte-identical to
// the text-only turn. With images ⇒ a multimodal content array: the instruction text first, then one
// `image_url` part per image, in order. `toImageUrl` (the image runner's one home for the mapping) owns
// the string-passthrough / bytes-as-png-data-URL rule.
async function summarizeUserContent(item: SummarizeRequestItem, normalize: NormalizeImageBytes): Promise<ChatUserMessageContent> {
  if (item.images === undefined || item.images.length === 0) {
    return item.userPrompt;
  }
  const textPart: ChatContentItems = { type: TEXT_PART_TYPE, text: item.userPrompt };
  const imageParts = await Promise.all(
    item.images.map(async (image): Promise<ChatContentItems> => ({ type: IMAGE_PART_TYPE, imageUrl: { url: await toImageUrl(image, normalize) } })),
  );
  return [textPart, ...imageParts];
}

export interface OpenRouterBackendDeps {
  readonly now: () => number;
  readonly random?: (() => number) | undefined;
  readonly getClient?: ((apiKey: string) => OrClient) | undefined;
  /** Outbound image-input wire-normalize (MA-6): GIF → first-frame PNG, else passthrough. Injected so the
   *  sharp adapter never leaks into this sealed backend; defaults to a label-only passthrough (no decode). */
  readonly normalizeImageBytes?: NormalizeImageBytes | undefined;
}

// ONE chat turn per input, run sequentially — OpenRouter's per-key rate limits make a parallel fan-out
// trip 429s. The structured-output constraint rides the caller's `ResponseFormat` (D79) — same vocabulary
// the vLLM engine reads, one projection rule fills the schema. An item carrying `images` becomes a
// multimodal user message (text + `image_url` parts) so hosted vision captioners match the vLLM surface;
// text-only items stay a plain-string turn.
async function runSummarize(client: OrClient, req: SummarizeRequest, normalize: NormalizeImageBytes): Promise<SummarizeResult> {
  const items: SummarizeResult["items"] = [];
  const responseFormat = req.responseFormat !== undefined ? buildChatResponseFormat(req.responseFormat) : undefined;
  for (const input of req.inputs) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential by design (see the OR per-key rate-limit note below); the per-item image normalize rides the same loop.
    const userContent = await summarizeUserContent(input, normalize);
    const chatRequest: SdkChatRequest = {
      model: req.model,
      messages: [
        { role: SYSTEM_ROLE, content: input.systemPrompt },
        { role: USER_ROLE, content: userContent },
      ],
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.maxTokens !== undefined ? { maxCompletionTokens: req.maxTokens } : {}),
      ...(responseFormat !== undefined ? { responseFormat } : {}),
    };
    const result = await client.chat.send({ chatRequest }, req.signal !== undefined ? { signal: req.signal } : undefined);
    const view = parseChatCompletionResult(result);
    const text = extractChatReply(view).replace(THINK_BLOCK_RE, "").trim();
    items.push({
      text,
      usage: {
        tokensIn: view.usage?.promptTokens ?? null,
        tokensOut: view.usage?.completionTokens ?? null,
        costUsd: view.usage?.cost ?? null,
      },
    });
  }
  return { items, model: req.model };
}

export function createOpenRouterBackend(deps: OpenRouterBackendDeps): ProviderBackend {
  const getClient = deps.getClient ?? createClientCache();
  const normalizeImageBytes = deps.normalizeImageBytes ?? passthroughImageNormalizer;
  const chatDeps: OpenRouterChatDeps = {
    now: deps.now,
    ...(deps.random !== undefined ? { random: deps.random } : {}),
  };
  const clientFor = (credential: EmbedRequest["credential"], label: string): OrClient => getClient(requireOpenRouterApiKey(credential, label));

  return {
    key: "openrouter",
    runChatTurn: async (req: ChatRequest): Promise<ChatResult> => {
      if (req.api === "agent-sdk" || req.api === "anthropic-messages") {
        throw new ProviderError({
          kind: "invalid",
          retryable: false,
          message: `openrouter backend does not serve the "${req.api}" api`,
        });
      }
      const narrowed: OpenRouterChatRequest = req;
      const client = clientFor(req.credential, req.api);
      return req.api === "responses" ? await runResponsesTurn(client, narrowed, chatDeps) : await runChatCompletionTurn(client, narrowed, chatDeps);
    },
    embed: async (req: EmbedRequest): Promise<EmbedResult> => await runEmbed(clientFor(req.credential, "embed"), req),
    rerank: async (req: RerankRequest): Promise<RerankResult> => await runRerank(clientFor(req.credential, "rerank"), req),
    imageEmbed: async (req: ImageEmbedRequest): Promise<ImageEmbedResult> =>
      await runImageEmbed(clientFor(req.credential, "imageEmbed"), req, normalizeImageBytes),
    summarize: async (req: SummarizeRequest): Promise<SummarizeResult> => await runSummarize(clientFor(req.credential, "summarize"), req, normalizeImageBytes),
    generateImage: async (req: ImageGenerateRequest): Promise<ImageGenerateResult> =>
      await runGenerateImage(clientFor(req.credential, "generateImage"), req, normalizeImageBytes),
    probe: async (req: ProbeRequest): Promise<CredentialHealth> => await probeOpenRouterCredential(clientFor(req.credential, "probe"), deps.now),
    accountCredits: async (req: AccountCreditsRequest): Promise<AccountCredits> =>
      await getOpenRouterCredits(clientFor(req.credential, "accountCredits"), req.signal),
    generationCost: async (req: GenerationCostRequest): Promise<GenerationCost> =>
      await getOpenRouterGenerationCost(clientFor(req.credential, "generationCost"), req.generationId, req.signal),
    fetchCatalog: async (_req: FetchCatalogRequest): Promise<ModelCatalogEntry[]> => await fetchOrCatalog(getClient("")),
  };
}
