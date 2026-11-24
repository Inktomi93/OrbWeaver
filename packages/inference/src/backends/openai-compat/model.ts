// The MODEL FACTORY — one `LanguageModelV4` / `EmbeddingModelV4` / `ImageModelV4` per CALL, built from the
// resolved connection through the transport package its provider row names (`dialect`). Per call, not
// per connection: the `transformRequestBody` / `wrapFetch` hooks close over THIS call's plan, warnings sink,
// chat id and capture context, and an SDK provider object is a handful of closures — there is nothing to
// cache. The dialect `Record` is the exhaustive map (a third transport package is a compile error here). A row
// whose folded `features.nativeChat` names a server's own chat route keeps the transport and translates its
// chat calls (`ollama-native.ts`).
//
// FORBIDDEN: a factory `name` other than the connection's exact registry id. It is not a label — the SDK
// derives `provider` as `${name}.${modelType}` (`getCommonModelConfig`) and reads `providerOptionsName` off
// `provider.split(".")[0].trim()` (`@ai-sdk/openai-compatible@3.0.75`), and files `providerMetadata` under
// whichever key that resolves to. A shared literal or a pretty name silently orphans the bag our result
// mapper reads (`drain.providerMetadata?.[ctx.providerMetadataKey]`, `v4/result.ts`, whose key each runner
// derives from `providerOptionsKey`), and the same footgun exists on the anthropic wire (`getProviderOptionsName`,
// `@ai-sdk/anthropic@4.0.85`).

import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { EmbeddingModelV4, ImageModelV4, LanguageModelV4 } from "@ai-sdk/provider";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { CachePolicy, Dialect, ProviderId } from "@orb/contracts/inference";
import { SETTABLE_WINDOW_FLOOR } from "@orb/contracts/inference";
import type { EffortLevel } from "@orb/contracts/preset";
import { wrapLanguageModel } from "ai";
import { ProviderError } from "#contract";
import { resolveCachePolicy } from "#funnel";
import type { ModelCall, NativeThink, ShapeArgs } from "#src/contract/openai-backend.ts";
import type { WrapFetchArgs } from "#src/contract/v4.ts";
import { authHeaders, onBaseOrigin, openAiPath } from "../http/fetch-json.ts";
import { cachePolicyContextOf, effectiveDialectOf, responseCacheHeaders } from "../http/response-cache.ts";
import { resolvedScrubSet } from "../http/sanitize.ts";
import { wrapFetch } from "../v4/fetch.ts";
import { applyRowExtras, shapeOutboundBody, userOwnedKeys } from "./body.ts";
import { fromOllamaChat, ollamaNativeFetch, toOllamaChat } from "./ollama-native.ts";
import { responsesReasoningTextStream } from "./responses-dialect.ts";
import { samplerBodyKeys } from "./sampling.ts";
import { systemFingerprintExtractor } from "./system-fingerprint.ts";
import { thinkTagMiddleware } from "./think-tags.ts";
import { openAiCompatConvertUsage } from "./usage.ts";

const OR_REFERER_HEADER = "HTTP-Referer";
const OR_TITLE_HEADER = "X-OpenRouter-Title";

function shapeArgs(call: ModelCall, dialect: Dialect): ShapeArgs {
  return {
    plan: call.plan,
    features: call.connection.features,
    extras: call.connection.extras,
    transport: call.connection.transport,
    dialect,
    prefillAllowed: call.prefillAllowed,
    prefillReasoning: call.prefillReasoning,
    templateThinking: call.templateThinking,
    templatePreserveReasoning: call.templatePreserveReasoning,
    reasoningMandatory: call.connection.capability.kind === "generation" && call.connection.capability.generation.reasoning.mandatory === true,
    foldSameRole: call.foldSameRole,
    replyImages: call.replyImages,
    imageDetail: call.imageDetail,
    warnings: call.warnings,
    cacheMarkers: call.cacheMarkers,
    cacheFormat: call.connection.capability.kind === "generation" ? call.connection.capability.generation.turns?.promptCacheFormat : undefined,
  };
}

function fetchArgs(call: ModelCall, shapeBody: WrapFetchArgs["shapeBody"]): WrapFetchArgs {
  const { connection, deps } = call;
  return {
    fetch: deps.fetch,
    secrets: resolvedScrubSet(connection),
    label: call.label,
    responseMap: connection.transport?.responseMap,
    reasoningKeys: connection.features.reasoningKeys,
    shapeBody,
    translateResponse: call.translateResponse,
    ...(deps.captureWire !== undefined
      ? {
          capture: {
            sink: deps.captureWire,
            chatId: call.chatId,
            api: call.api,
            wire: connection.wire,
            providerId: connection.providerId,
            model: connection.model,
            reply: deps.captureWireReply === true,
          },
        }
      : {}),
  };
}

/** The `providerOptions` key the openai-compatible SDK reads for a provider named `name`. The SDK
 *  accepts BOTH the raw name and its camel form, but pushes a `deprecated` warning on EVERY call when the
 *  raw form differs and is the one present (`warnIfDeprecatedProviderOptionsKey`,
 *  `@ai-sdk/openai-compatible@3.0.75`) — and our provider ids are hyphenated (`custom-openai`, `lm-studio`). The camel form is
 *  the non-deprecated spelling, so it is the only one we write. */
export function providerOptionsKey(providerId: ProviderId): string {
  return providerId.replace(/[_-]([a-z])/gu, (_match, letter: string) => letter.toUpperCase());
}

/** The row's base URL, which the resolve guarantees for an HTTP wire; a `null` here is an operator error. */
function baseUrlOf(call: ModelCall): string {
  const baseUrl = call.connection.baseUrl;
  if (baseUrl === null) {
    throw new ProviderError({ kind: "invalid", retryable: false, message: `${call.label}: the connection carries no base URL` });
  }
  return baseUrl;
}

/** The chat base for this call: the row's own, or the beta route named by `features.betaChatPath` when the turn
 *  sends a beta-gated field (the `prefix-flag` prefill stamp or a strict tool — the factory is per call, so the
 *  hop is scoped to the request that needs it). The declared path is checked to stay on the base URL's origin
 *  before anything is sent, like every other declared path. */
function chatBaseOf(call: ModelCall): string {
  const base = baseUrlOf(call);
  const betaPath = call.requiresBetaRoute === true ? call.connection.features.betaChatPath : undefined;
  if (betaPath === undefined) {
    return openAiPath(base, "");
  }
  const checked = onBaseOrigin(base, new URL(betaPath, base).toString(), call.label);
  return openAiPath(checked, "");
}

interface Transport {
  readonly language: (call: ModelCall) => LanguageModelV4;
  readonly embedding: (call: ModelCall) => EmbeddingModelV4;
  readonly image: (call: ModelCall) => ImageModelV4;
}

function openAiCompatibleProvider(call: ModelCall): ReturnType<typeof createOpenAICompatible> {
  const { connection } = call;
  const args = shapeArgs(call, "openai-compatible");
  const withExtra = (body: Record<string, unknown>): Record<string, unknown> => shapeOutboundBody({ ...body, ...(call.extraBody ?? {}) }, args);
  return createOpenAICompatible({
    name: connection.providerId,
    baseURL: chatBaseOf(call),
    headers: authHeaders(connection.credential.secret, connection.transport?.headers),
    fetch: wrapFetch(fetchArgs(call, undefined)),
    includeUsage: true,
    // The vendor's raw frame → our usage axes (the SDK drops `cache_write_tokens` and zero-coerces
    // absent axes; `usage.ts` states the reading and the null-vs-zero discipline).
    convertUsage: openAiCompatConvertUsage,
    // The structured plan decides whether a response format rides; the SDK must never downgrade one itself.
    supportsStructuredOutputs: true,
    // Structured tool results ride as parts instead of being JSON-stringified into `content` (the
    // `supportsMultiPartToolContent` flag of `convertToOpenAICompatibleChatMessages`, default `false`,
    // `@ai-sdk/openai-compatible@3.0.75`). Inert for our history today — `v4/prompt.ts`'s tool-result arm
    // emits only `text`/`error-text` tool outputs, so the `content` arm this gates is unreachable — and correct
    // the moment a `content` output exists, since a stringified array is not what a multi-part-tolerant
    // endpoint should receive.
    supportsMultiPartToolContent: true,
    transformRequestBody: withExtra,
    // The response schema strips `system_fingerprint` before the drain can see it, so it rides the SDK's own
    // extractor hook, filed under the key the fold reads back (`system-fingerprint.ts`, `providerOptionsKey`).
    metadataExtractor: systemFingerprintExtractor(providerOptionsKey(connection.providerId)),
  });
}

/** The window a native row sends as `num_ctx`: the resolved capability's, so the server runs what the fit
 *  budgets against, never below the floor a settable route holds a preset value to (a guessed window takes the preset's
 *  number as given for budgeting, but a server window that small only truncates the prompt). */
function nativeWindow(call: ModelCall): number | undefined {
  const capability = call.connection.capability;
  return capability.kind === "generation" ? Math.max(capability.generation.context.window, SETTABLE_WINDOW_FLOOR) : undefined;
}

/** What Ollama's `think` is spelled from: the resolved effort, the levels the model names, and the template switch. */
function nativeThink(call: ModelCall): NativeThink {
  const capability = call.connection.capability;
  return {
    effort: call.reasoningEffort,
    levels: capability.kind === "generation" ? capability.generation.reasoning.effortLevels : undefined,
    on: call.templateThinking,
  };
}

/** A row whose folded `features.nativeChat` is `ollama` (D310): the same SDK and the same body shaping, with
 *  the request translated to `/api/chat` in `shapeBody` (so the capture holds the native body) and the reply
 *  translated back underneath `wrapFetch`. */
function ollamaNativeProvider(call: ModelCall): ReturnType<typeof createOpenAICompatible> {
  const { connection, deps } = call;
  const baseUrl = baseUrlOf(call);
  const args = shapeArgs(call, "openai-compatible");
  const withExtra = (body: Record<string, unknown>): Record<string, unknown> => shapeOutboundBody({ ...body, ...(call.extraBody ?? {}) }, args);
  const samplerKeys = samplerBodyKeys(connection.features);
  const userOwned = userOwnedKeys(args);
  const toNative = (body: Record<string, unknown>): Record<string, unknown> => {
    const native = toOllamaChat(body, {
      numCtx: nativeWindow(call),
      samplerKeys,
      label: call.label,
      think: nativeThink(call),
      userOwned,
      keepAlive: connection.features.keepAlive,
      numBatch: connection.features.numBatch,
      warnings: call.warnings,
    });
    call.onNativeBody?.(native);
    return native;
  };
  return createOpenAICompatible({
    name: connection.providerId,
    baseURL: openAiPath(baseUrl, ""),
    headers: authHeaders(connection.credential.secret, connection.transport?.headers),
    fetch: wrapFetch({
      ...fetchArgs(call, toNative),
      fetch: ollamaNativeFetch(deps.fetch, { baseUrl }),
      translateResponse: (res) => fromOllamaChat(res, call.label),
    }),
    includeUsage: true,
    // The same usage reading as the chat factory: `fromOllamaChat` re-spells the native frame into the
    // OpenAI shape this hook reads, so both rows answer the same axes.
    convertUsage: openAiCompatConvertUsage,
    // The structured plan decides whether a response format rides; the SDK must never downgrade one itself.
    supportsStructuredOutputs: true,
    transformRequestBody: withExtra,
  });
}

function responsePolicyFor(call: ModelCall, responseReplaySupported: boolean): CachePolicy {
  if (call.cachePolicy !== undefined) {
    return call.cachePolicy;
  }
  const context = cachePolicyContextOf(call.connection, responseReplaySupported);
  const resolved = resolveCachePolicy({
    context: { ...context, promptSettings: { ...context.promptSettings, enabled: false } },
    preset: call.responseCacheSettings,
    request: call.responseCache,
  });
  call.warnings.push(...resolved.warnings);
  return resolved.plan;
}

function openRouterProvider(call: ModelCall, responseReplaySupported: boolean): ReturnType<typeof createOpenRouter> {
  const { connection, deps } = call;
  const args = shapeArgs(call, "openrouter");
  const shapeBody = (body: Record<string, unknown>): Record<string, unknown> => shapeOutboundBody({ ...body, ...(call.extraBody ?? {}) }, args);
  const headers = new Headers({ [OR_REFERER_HEADER]: deps.app.url, [OR_TITLE_HEADER]: deps.app.name });
  const policy = responsePolicyFor(call, responseReplaySupported);
  for (const [key, value] of Object.entries(responseCacheHeaders({ configured: connection.transport?.headers, plan: policy }))) {
    headers.set(key, value);
  }
  return createOpenRouter({
    baseURL: baseUrlOf(call),
    ...(connection.credential.secret !== null ? { apiKey: connection.credential.secret } : {}),
    headers: Object.fromEntries(headers),
    fetch: wrapFetch(fetchArgs(call, shapeBody)),
    compatibility: "strict",
  });
}

/** The `/responses` protocol on this wire (`apis.ts` revival ruling, `responses.ts` runner): the SAME
 *  URL convention as the chat transports (`openAiPath`, so the SDK POSTs `<base>/v1/responses` — the
 *  path DeepSeek serves) and the SAME wrapped fetch (capture, scrub, response-map). The SDK's
 *  own auth line is built from `apiKey`; an endpoint row has no secret, so the caller's own headers win
 *  the `Authorization` key (the SDK spreads `options.headers` last) and `apiKey: ""` only keeps the
 *  factory off the server process's `OPENAI_API_KEY` fallback. Per-call like every other factory here.
 *
 *  `reasoningEffort` closes one SDK gap at the body seam: the responses converter gates its whole
 *  `reasoning` arm on its OWN catalog (`getOpenAILanguageModelCapabilities` — o-series/gpt-5 regexes),
 *  so for every off-catalog id on this wire an options-level `reasoning` is silently DROPPED from the
 *  body (in 4.0.99's dist, `isReasoningModel &&` gates the arm). The shapeBody hook rides the
 *  field the SDK should have written — only when the SDK's own body carries no `reasoning` arm, so a
 *  catalog model that spelled its own is never touched, and the capture sees the final bytes. */
export function responsesModelFor(call: ModelCall, reasoningEffort: EffortLevel | undefined): LanguageModelV4 {
  const reasoningText = call.connection.features.responsesReasoningStream === "text";
  const args = shapeArgs(call, "openai-compatible");
  // The shape-agnostic row-body rules (`extras`, `includeBody`/`excludeBody`) carry on this route too —
  // everything else in `shapeOutboundBody` is chat-body shaped and would corrupt a Responses body.
  const shapeBody = (body: Record<string, unknown>): Record<string, unknown> => {
    const shaped = applyRowExtras({ ...body, ...(call.extraBody ?? {}) }, args);
    return reasoningEffort === undefined || shaped["reasoning"] !== undefined ? shaped : { ...shaped, reasoning: { effort: reasoningEffort } };
  };
  return createOpenAI({
    baseURL: openAiPath(baseUrlOf(call), ""),
    apiKey: call.connection.credential.secret ?? "",
    headers: authHeaders(call.connection.credential.secret, call.connection.transport?.headers),
    fetch: wrapFetch({
      ...fetchArgs(call, shapeBody),
      // The raw-reasoning dialect is rewritten onto the SDK's summary spelling BEFORE the SDK parses it
      // (`responses-dialect.ts`); the capture keeps the bytes the server actually sent.
      ...(reasoningText ? { translateResponse: responsesReasoningTextStream } : {}),
    }),
  }).responses(call.connection.model);
}

const TRANSPORTS: Record<Dialect, Transport> = {
  "openai-compatible": {
    language: (call) => openAiCompatibleProvider(call).chatModel(call.connection.model),
    embedding: (call) => openAiCompatibleProvider(call).embeddingModel(call.connection.model),
    image: (call) => openAiCompatibleProvider(call).imageModel(call.connection.model),
  },
  openrouter: {
    language: (call) =>
      openRouterProvider(call, true).chat(call.connection.model, {
        usage: { include: true },
        ...(call.openRouterChat?.strict !== undefined ? { structuredOutputs: { strict: call.openRouterChat.strict } } : {}),
        ...(call.openRouterChat?.parallelToolCalls !== undefined ? { parallelToolCalls: call.openRouterChat.parallelToolCalls } : {}),
      }),
    embedding: (call) =>
      openRouterProvider(call, true).textEmbeddingModel(call.connection.model, {
        ...(call.extraBody !== undefined ? { extraBody: { ...call.extraBody } } : {}),
      }),
    image: (call) =>
      openRouterProvider(call, false).imageModel(call.connection.model, { ...(call.extraBody !== undefined ? { extraBody: { ...call.extraBody } } : {}) }),
  },
};

export function languageModelFor(call: ModelCall): LanguageModelV4 {
  const model =
    call.connection.features.nativeChat === "ollama"
      ? ollamaNativeProvider(call).chatModel(call.connection.model)
      : TRANSPORTS[effectiveDialectOf(call.connection)].language(call);
  // A server with NO native reasoning field and an XML-shaped preset tag pair gets the SDK's stream-time
  // splitter. Empty list ⇒ the bare model, so every other row is byte-identical and
  // pays no wrapper (`wrapLanguageModel` with no middleware would still be a layer on every turn).
  const middleware = thinkTagMiddleware({ reasoningKeys: call.connection.features.reasoningKeys, tags: call.reasoningTags });
  return middleware.length === 0 ? model : wrapLanguageModel({ model, middleware });
}

export function embeddingModelFor(call: ModelCall): EmbeddingModelV4 {
  return TRANSPORTS[effectiveDialectOf(call.connection)].embedding(call);
}

export function imageModelFor(call: ModelCall): ImageModelV4 {
  return TRANSPORTS[effectiveDialectOf(call.connection)].image(call);
}

export type { ModelCall } from "#src/contract/openai-backend.ts";
