// biome-ignore-all lint/performance/noBarrelFile: the openrouter FAMILY barrel — the sealed seam `entry/`
// uses to obtain the backend factory + the diagnostic verbs (catalog-fetch / account / probe), and the
// surface the family's tests import (deep imports into `backends/openrouter/<file>` are RED for everyone
// else by the `providers-public-surface-only` cruiser rule). Load-bearing for the encapsulation invariant.

// The stateless remote chat backend + the non-chat roles OpenRouter serves (embed/rerank/imageEmbed/
// generateImage) + the summarize shaper over chat. No `runAgentTurn` (agent mode is agent-sdk's).

import type { ChatRequest as SdkChatRequest } from "@openrouter/sdk/models";
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
  SummarizeResult,
} from "../../contract";
import { ProviderError } from "../../contract";
import { extractChatReply, parseChatCompletionResult } from "../kit";
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
import { runGenerateImage, runImageEmbed } from "./runners/image/runner";
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
  resolveProviderPreferences,
} from "./runners/chat/shared";
export { runEmbed } from "./runners/embed/runner";
export { runGenerateImage, runImageEmbed } from "./runners/image/runner";
export { runRerank } from "./runners/rerank/runner";

const SYSTEM_ROLE = "system";
const USER_ROLE = "user";
// The summary text must never carry `<think>…</think>` scaffolding.
const THINK_BLOCK_RE = /<think>[\s\S]*?<\/think>/g;

export interface OpenRouterBackendDeps {
  readonly now: () => number;
  readonly random?: (() => number) | undefined;
  readonly getClient?: ((apiKey: string) => OrClient) | undefined;
}

// ONE chat turn per input, run sequentially — OpenRouter's per-key rate limits make a parallel fan-out
// trip 429s. The schema name "result" matches the vLLM engine's fixed name (one wire contract, two backends).
async function runSummarize(client: OrClient, req: SummarizeRequest): Promise<SummarizeResult> {
  const items: SummarizeResult["items"] = [];
  const responseFormat =
    req.jsonSchema !== undefined
      ? buildChatResponseFormat({
          name: "result",
          schema: req.jsonSchema as Record<string, unknown>,
        })
      : undefined;
  for (const input of req.inputs) {
    const chatRequest: SdkChatRequest = {
      model: req.model,
      messages: [
        { role: SYSTEM_ROLE, content: input.systemPrompt },
        { role: USER_ROLE, content: input.userPrompt },
      ],
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.maxTokens !== undefined ? { maxCompletionTokens: req.maxTokens } : {}),
      ...(responseFormat !== undefined ? { responseFormat } : {}),
    };
    // biome-ignore lint/performance/noAwaitInLoops: sequential by design — OpenRouter per-key rate limits make a parallel fan-out trip 429s.
    const result = await client.chat.send(
      { chatRequest },
      req.signal !== undefined ? { signal: req.signal } : undefined,
    );
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
  const chatDeps: OpenRouterChatDeps = {
    now: deps.now,
    ...(deps.random !== undefined ? { random: deps.random } : {}),
  };
  const clientFor = (credential: EmbedRequest["credential"], label: string): OrClient =>
    getClient(requireOpenRouterApiKey(credential, label));

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
      return req.api === "responses"
        ? await runResponsesTurn(client, narrowed, chatDeps)
        : await runChatCompletionTurn(client, narrowed, chatDeps);
    },
    embed: async (req: EmbedRequest): Promise<EmbedResult> =>
      await runEmbed(clientFor(req.credential, "embed"), req),
    rerank: async (req: RerankRequest): Promise<RerankResult> =>
      await runRerank(clientFor(req.credential, "rerank"), req),
    imageEmbed: async (req: ImageEmbedRequest): Promise<ImageEmbedResult> =>
      await runImageEmbed(clientFor(req.credential, "imageEmbed"), req),
    summarize: async (req: SummarizeRequest): Promise<SummarizeResult> =>
      await runSummarize(clientFor(req.credential, "summarize"), req),
    generateImage: async (req: ImageGenerateRequest): Promise<ImageGenerateResult> =>
      await runGenerateImage(clientFor(req.credential, "generateImage"), req),
    probe: async (req: ProbeRequest): Promise<CredentialHealth> =>
      await probeOpenRouterCredential(clientFor(req.credential, "probe"), deps.now),
    accountCredits: async (req: AccountCreditsRequest): Promise<AccountCredits> =>
      await getOpenRouterCredits(clientFor(req.credential, "accountCredits")),
    generationCost: async (req: GenerationCostRequest): Promise<GenerationCost> =>
      await getOpenRouterGenerationCost(
        clientFor(req.credential, "generationCost"),
        req.generationId,
      ),
    fetchCatalog: async (_req: FetchCatalogRequest): Promise<ModelCatalogEntry[]> =>
      await fetchOrCatalog(getClient("")),
  };
}
