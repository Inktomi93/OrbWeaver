// The MODEL FACTORY — one `LanguageModelV4` / `EmbeddingModelV4` / `ImageModelV4` per CALL, built from the
// resolved connection through the transport package its provider row names (`dialect`, §8.1). Per call, not
// per connection: the `transformRequestBody` / `wrapFetch` hooks close over THIS call's plan, warnings sink,
// chat id and capture context, and an SDK provider object is a handful of closures — there is nothing to
// cache. The dialect `Record` is the exhaustive map (a third transport package is a compile error here). A row
// whose folded `features.nativeChat` names a server's own chat route keeps the transport and translates its
// chat calls (`ollama-native.ts`).

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { EmbeddingModelV4, ImageModelV4, LanguageModelV4 } from "@ai-sdk/provider";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { CachePolicy, Dialect } from "@orb/contracts/inference";
import { wrapLanguageModel } from "ai";
import { ProviderError } from "#contract";
import { resolveCachePolicy } from "#funnel";
import type { ModelCall, NativeThink, ShapeArgs } from "../../contract/openai-backend.ts";
import type { WrapFetchArgs } from "../../contract/v4.ts";
import { authHeaders, openAiPath } from "../http/fetch-json.ts";
import { cachePolicyContextOf, effectiveDialectOf, responseCacheHeaders } from "../http/response-cache.ts";
import { resolvedScrubSet } from "../http/sanitize.ts";
import { wrapFetch } from "../v4/fetch.ts";
import { shapeOutboundBody, userOwnedKeys } from "./body.ts";
import { fromOllamaChat, ollamaNativeFetch, toOllamaChat } from "./ollama-native.ts";
import { samplerBodyKeys } from "./sampling.ts";
import { thinkTagMiddleware } from "./think-tags.ts";

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

/** The `providerOptions` key the openai-compatible SDK reads for a provider named `name` (§E2). The SDK
 *  accepts BOTH the raw name and its camel form, but pushes a `deprecated` warning on EVERY call when the
 *  raw form differs and is the one present (`to-camel-case.ts` + `warnIfDeprecatedProviderOptionsKey`, dist
 *  `index.js:25-45`) — and our provider ids are hyphenated (`custom-openai`, `lm-studio`). The camel form is
 *  the non-deprecated spelling, so it is the only one we write. */
export function providerOptionsKey(providerId: string): string {
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
    baseURL: openAiPath(baseUrlOf(call), ""),
    headers: authHeaders(connection.credential.secret, connection.transport?.headers),
    fetch: wrapFetch(fetchArgs(call, undefined)),
    includeUsage: true,
    // The structured plan decides whether a response format rides; the SDK must never downgrade one itself.
    supportsStructuredOutputs: true,
    transformRequestBody: withExtra,
  });
}

/** The window a native row sends as `num_ctx`: the resolved capability's, so the server runs what the fit
 *  budgets against. */
function nativeWindow(call: ModelCall): number | undefined {
  const capability = call.connection.capability;
  return capability.kind === "generation" ? capability.generation.context.window : undefined;
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
  // The F-table "Adopt" row: a server with NO native reasoning field and an XML-shaped preset tag pair gets
  // the SDK's stream-time splitter. Empty list ⇒ the bare model, so every other row is byte-identical and
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

export type { ModelCall, TransportDeps } from "../../contract/openai-backend.ts";
