// biome-ignore-all lint/performance/noBarrelFile: the openrouter FAMILY barrel — the sealed seam `entry/`
// uses to obtain the backend factory + the diagnostic verbs (catalog-fetch / account / probe), and the
// surface the family's tests import (deep imports into `backends/openrouter/<file>` are RED for everyone
// else by the `providers-public-surface-only` cruiser rule). Load-bearing for the encapsulation invariant.

// The stateless remote chat backend + the non-chat roles OpenRouter serves (embed/rerank/imageEmbed/
// generateImage) + the summarize shaper over chat. No `runAgentTurn` (agent mode is agent-sdk's).

import type { ChatContentItems, ChatUserMessageContent, ChatRequest as SdkChatRequest } from "@openrouter/sdk/models";
import { ChatRequest$outboundSchema } from "@openrouter/sdk/models";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import { errorMessage } from "@orb/kit/error-message";
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
  StructuredRequest,
  SummarizeRequest,
  SummarizeRequestItem,
  SummarizeResult,
  WireCaptureSink,
} from "../../contract";
import { ProviderError } from "../../contract";
import type { NormalizeImageBytes } from "../kit";
import { extractChatReply, logProviderSummarizeItem, parseChatCompletionResult, passthroughImageNormalizer } from "../kit";
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
// A PROSE summary must never carry `<think>…</think>` scaffolding — but the STRUCTURED role SKIPS this strip
// (S3): constrained JSON may legitimately contain a literal `<think>` inside a string value.
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
  readonly captureWire?: WireCaptureSink | undefined;
}

// The batch deps — the client + the image normalizer + the observability seam (now + the WIRE_CAPTURE sink).
// OBSERVABILITY parity with the vLLM surface + the chat runners: each item captures its LITERAL wire body
// (outbound-schema'd, gated by captureWire) AND emits a per-item turn log for success AND failure, TAGGED BY
// role (`summarize` vs `structured` — owner ruling 2026-07-27) — a structured extraction is never a black hole.
interface OrBatchDeps {
  readonly client: OrClient;
  readonly normalize: NormalizeImageBytes;
  readonly now: () => number;
  readonly captureWire?: WireCaptureSink | undefined;
}

// The normalized per-role batch request the shared OR runner consumes — the `summarize` + `structured` role
// requests both project onto this. `role` drives the observability tag; `responseFormat` is present iff structured.
interface OrBatchReq {
  readonly model: string;
  readonly role: "summarize" | "structured";
  readonly inputs: readonly SummarizeRequestItem[];
  readonly responseFormat: ResponseFormat | undefined;
  readonly temperature: number | undefined;
  readonly maxTokens: number | undefined;
  readonly signal: AbortSignal | undefined;
}

const OR_BACKEND = "openrouter";

// Build ONE item's SDK chat request (system + the possibly-multimodal user content + the sampling knobs + the
// optional structured-output format).
async function buildOrBatchRequest(deps: OrBatchDeps, req: OrBatchReq, input: SummarizeRequestItem): Promise<SdkChatRequest> {
  const responseFormat = req.responseFormat !== undefined ? buildChatResponseFormat(req.responseFormat) : undefined;
  const userContent = await summarizeUserContent(input, deps.normalize);
  return {
    model: req.model,
    messages: [
      { role: SYSTEM_ROLE, content: input.systemPrompt },
      { role: USER_ROLE, content: userContent },
    ],
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.maxTokens !== undefined ? { maxCompletionTokens: req.maxTokens } : {}),
    ...(responseFormat !== undefined ? { responseFormat } : {}),
  };
}

// The failed-item log + the re-thrown, cause-chained ProviderError (batch rejects exactly as before).
function throwOrBatchFailure(args: {
  readonly role: "summarize" | "structured";
  readonly model: string;
  readonly index: number;
  readonly durationMs: number;
  readonly hasResponseFormat: boolean;
  readonly err: unknown;
}): never {
  const { role, model, index, durationMs, hasResponseFormat, err } = args;
  logProviderSummarizeItem(OR_BACKEND, {
    role,
    model,
    index,
    durationMs,
    ok: false,
    tokensIn: null,
    tokensOut: null,
    finishReason: null,
    hasResponseFormat,
    errorKind: err instanceof ProviderError ? err.kind : "unknown",
  });
  throw new ProviderError({
    kind: err instanceof ProviderError ? err.kind : "server",
    retryable: err instanceof ProviderError ? err.retryable : true,
    message: `openrouter ${role} item ${index} failed: ${errorMessage(err)}`,
    cause: err,
  });
}

// Run ONE item + emit its observability. Re-throws on failure; extracted so `runOrBatch` stays under the
// cognitive-complexity gate.
async function runOrBatchItem(deps: OrBatchDeps, req: OrBatchReq, input: SummarizeRequestItem, index: number): Promise<SummarizeResult["items"][number]> {
  const hasResponseFormat = req.responseFormat !== undefined;
  const chatRequest = await buildOrBatchRequest(deps, req, input);
  // Capture the TRUE wire (outbound-schema'd, snake_case) right before the send — parity with the chat runner,
  // tagged by role so extraction ≠ summarize in the trail.
  deps.captureWire?.({
    chatId: undefined,
    api: req.role,
    backend: OR_BACKEND,
    model: req.model,
    body: ChatRequest$outboundSchema.parse(chatRequest) as Record<string, unknown>,
  });
  const startedAt = deps.now();
  try {
    const result = await deps.client.chat.send({ chatRequest }, req.signal !== undefined ? { signal: req.signal } : undefined);
    const view = parseChatCompletionResult(result);
    // S3 — skip the CoT strip on the STRUCTURED role (constrained output IS pure JSON; a literal `<think>` there
    // is a legitimate JSON string value, e.g. journal content quoting the tag — stripping would corrupt it). The
    // prose (summarize) path still strips loose `<think>…</think>` scaffolding.
    const reply = extractChatReply(view);
    const text = hasResponseFormat ? reply.trim() : reply.replace(THINK_BLOCK_RE, "").trim();
    const tokensIn = view.usage?.promptTokens ?? null;
    const tokensOut = view.usage?.completionTokens ?? null;
    logProviderSummarizeItem(OR_BACKEND, {
      role: req.role,
      model: req.model,
      index,
      durationMs: deps.now() - startedAt,
      ok: true,
      tokensIn,
      tokensOut,
      finishReason: view.choices?.[0]?.finishReason ?? null,
      hasResponseFormat,
    });
    return { text, usage: { tokensIn, tokensOut, costUsd: view.usage?.cost ?? null } };
  } catch (err) {
    return throwOrBatchFailure({ role: req.role, model: req.model, index, durationMs: deps.now() - startedAt, hasResponseFormat, err });
  }
}

// ONE chat turn per input, run sequentially — OpenRouter's per-key rate limits make a parallel fan-out
// trip 429s. Shared by the `summarize` + `structured` roles (one wire home). An item carrying `images`
// becomes a multimodal user message (text + `image_url` parts); text-only items stay a plain-string turn.
async function runOrBatch(deps: OrBatchDeps, req: OrBatchReq): Promise<SummarizeResult> {
  const items: SummarizeResult["items"] = [];
  for (const [index, input] of req.inputs.entries()) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential by design (see the OR per-key rate-limit note above); the per-item image normalize rides the same loop.
    items.push(await runOrBatchItem(deps, req, input, index));
  }
  return { items, model: req.model };
}

export function createOpenRouterBackend(deps: OpenRouterBackendDeps): ProviderBackend {
  const getClient = deps.getClient ?? createClientCache();
  const normalizeImageBytes = deps.normalizeImageBytes ?? passthroughImageNormalizer;
  const chatDeps: OpenRouterChatDeps = {
    now: deps.now,
    ...(deps.random !== undefined ? { random: deps.random } : {}),
    ...(deps.captureWire !== undefined ? { captureWire: deps.captureWire } : {}),
  };
  const clientFor = (credential: EmbedRequest["credential"], label: string): OrClient => getClient(requireOpenRouterApiKey(credential, label));
  // The shared batch deps for the summarize + structured roles (one wire home).
  const batchDeps = (client: OrClient): OrBatchDeps => ({
    client,
    normalize: normalizeImageBytes,
    now: deps.now,
    ...(deps.captureWire !== undefined ? { captureWire: deps.captureWire } : {}),
  });

  return {
    key: "openrouter",
    runChatTurn: async (req: ChatRequest): Promise<ChatResult> => {
      if (req.api === "agent-sdk") {
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
    summarize: async (req: SummarizeRequest): Promise<SummarizeResult> =>
      await runOrBatch(batchDeps(clientFor(req.credential, "summarize")), {
        model: req.model,
        role: "summarize",
        inputs: req.inputs,
        responseFormat: undefined,
        temperature: req.temperature,
        maxTokens: req.maxTokens,
        signal: req.signal,
      }),
    structured: async (req: StructuredRequest): Promise<SummarizeResult> =>
      await runOrBatch(batchDeps(clientFor(req.credential, "structured")), {
        model: req.model,
        role: "structured",
        inputs: req.inputs,
        responseFormat: req.responseFormat,
        temperature: req.temperature,
        maxTokens: req.maxTokens,
        signal: req.signal,
      }),
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
