// biome-ignore-all lint/performance/noBarrelFile: the openrouter FAMILY barrel — the sealed seam `entry/`
// uses to obtain the backend factory + the diagnostic verbs (catalog-fetch / account / probe), and the
// surface the family's tests import (deep imports into `backends/openrouter/<file>` are RED for everyone
// else by the `providers-public-surface-only` cruiser rule). Load-bearing for the encapsulation invariant.
//
// infra/providers/backends/openrouter — THE STATELESS REMOTE CHAT BACKEND + the non-chat roles OpenRouter
// serves (embed / imageEmbed / generateImage; rerank is a typed not-supported throw) + the summarize shaper
// over chat. Sealed: no other backend imports it; it imports only the shared `backends/kit` wire helpers
// DOWN + the `@openrouter/sdk`. NO `runAgentTurn` (agent mode is the agent-sdk backend's).
//
// FLAG SUMMARY (orchestrator):
//   • account.ts result shapes have no `@orb/contracts` home yet (see that file's FLAG).
//   • rerank is a typed throw per the doc, though the SDK now ships a rerank endpoint (see rerank/runner).
//   • provider-routing maps only the common knobs (snake→camel impedance — see shared.ts toProviderPreferences).
//   • the Responses input drops the per-participant `name` (SDK `EasyInputMessage` has none — see responses).
//   • OR `summarize` is a TEXT-only shaper here (images on a SummarizeRequestItem are dropped — OR vision
//     summarize is out of scope for this slice).

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
import { runEmbed } from "./runners/embed/runner";
import { runGenerateImage, runImageEmbed } from "./runners/image/runner";
import { runRerank } from "./runners/rerank/runner";

// ── Family-internal surface (entry wiring + diagnostics + the family's OWN tests). NOT domain-reachable. ──
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
  buildHistoryMessages,
  buildReasoningRequest,
  buildSystemMessage,
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
// Defensive CoT strip: the summary text must never carry `<think>…</think>` scaffolding (mirrors the vllm
// summarize surface — a 1-line wire quirk, deliberately not abstracted across sealed backends).
const THINK_BLOCK_RE = /<think>[\s\S]*?<\/think>/g;

/**
 * The deps `entry/` injects to build the backend. `now` is REQUIRED — the composition root owns the clock
 * (the `no-raw-clock` determinism seam). `random` is optional (tests inject a seeded RNG for the pre-commit
 * retry's backoff jitter). `getClient` defaults to the real per-API-key LRU; tests override it with a fake.
 */
export interface OpenRouterBackendDeps {
  readonly now: () => number;
  readonly random?: (() => number) | undefined;
  readonly getClient?: ((apiKey: string) => OrClient) | undefined;
}

// The summarize shaper: ONE chat turn per input, run SEQUENTIALLY (OpenRouter enforces per-key rate
// limits, so a parallel fan-out trips 429s). A thin shaper over chat — it never duplicates chat logic.
async function runSummarize(client: OrClient, req: SummarizeRequest): Promise<SummarizeResult> {
  const items: SummarizeResult["items"] = [];
  for (const input of req.inputs) {
    const chatRequest: SdkChatRequest = {
      model: req.model,
      messages: [
        { role: SYSTEM_ROLE, content: input.systemPrompt },
        { role: USER_ROLE, content: input.userPrompt },
      ],
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.maxTokens !== undefined ? { maxCompletionTokens: req.maxTokens } : {}),
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

/**
 * Build the sealed openrouter {@link ProviderBackend}. Each role resolves the API key off the request's
 * credential (fail-closed on a wrong source), gets a warm client, and dispatches. `runChatTurn` routes its
 * `responses`/`chat-completions` arms to the two chat runners and rejects an `agent-sdk` request (that api
 * is the agent-sdk backend's). The methods are async so a synchronous guard throw surfaces as a rejected
 * promise (the contract method must always be awaitable).
 */
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
    // async so a synchronous guard throw (wrong api / wrong credential source) surfaces as a rejected
    // promise — the contract method must always be awaitable.
    runChatTurn: async (req: ChatRequest): Promise<ChatResult> => {
      if (req.api === "agent-sdk") {
        throw new ProviderError({
          kind: "invalid",
          retryable: false,
          message: 'openrouter backend does not serve the "agent-sdk" api',
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
    rerank: async (req: RerankRequest): Promise<RerankResult> => await runRerank(req),
    imageEmbed: async (req: ImageEmbedRequest): Promise<ImageEmbedResult> =>
      await runImageEmbed(clientFor(req.credential, "imageEmbed"), req),
    summarize: async (req: SummarizeRequest): Promise<SummarizeResult> =>
      await runSummarize(clientFor(req.credential, "summarize"), req),
    generateImage: async (req: ImageGenerateRequest): Promise<ImageGenerateResult> =>
      await runGenerateImage(clientFor(req.credential, "generateImage"), req),
    // ── Diagnostics: credit/cost/probe bind the client off the resolved credential (fail-closed on a
    //    wrong source); fetchCatalog uses a keyless ("") client — the OR `/models` endpoint is public. ──
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
