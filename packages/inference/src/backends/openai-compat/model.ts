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
import type { Dialect, EffortLevel, ImageDetail } from "@orb/contracts/inference";
import type { ChatId } from "@orb/kit/ids";
import { wrapLanguageModel } from "ai";
import type { WireCaptureSink } from "../../contract/backend.ts";
import { ProviderError } from "../../contract/errors.ts";
import type { ResolvedWarning } from "../../contract/resolve.ts";
import type { Resolved } from "../../contract/resolved.ts";
import { authHeaders, openAiPath } from "../kit/fetch-json.ts";
import { resolvedScrubSet } from "../kit/sanitize.ts";
import type { WrapFetchArgs } from "../v4/fetch.ts";
import { wrapFetch } from "../v4/fetch.ts";
import type { WirePlan } from "../v4/prompt.ts";
import type { ShapeArgs } from "./body.ts";
import { shapeOutboundBody, userOwnedKeys } from "./body.ts";
import type { NativeThink } from "./ollama-native.ts";
import { fromOllamaChat, ollamaNativeFetch, toOllamaChat } from "./ollama-native.ts";
import { samplerBodyKeys } from "./sampling.ts";
import type { ReasoningTags } from "./think-tags.ts";
import { thinkTagMiddleware } from "./think-tags.ts";

const OR_REFERER_HEADER = "HTTP-Referer";
const OR_TITLE_HEADER = "X-OpenRouter-Title";

/** The transport-level deps a backend hands the factory: the egress-guarded fetch, the capture sink, the app
 *  identity OpenRouter attributes traffic to. */
export interface TransportDeps {
  readonly fetch: typeof fetch;
  readonly captureWire?: WireCaptureSink | undefined;
  /** Tap the reply bytes onto the capture entry too (§D2) — the process-tier opt-in, off by default. */
  readonly captureWireReply?: boolean | undefined;
  readonly app: { readonly name: string; readonly url: string };
}

/** Everything one call needs the hooks to know. `plan` is null on the non-chat surfaces (no re-attach). */
export interface ModelCall {
  readonly imageDetail?: ImageDetail | undefined;
  readonly connection: Resolved;
  readonly deps: TransportDeps;
  readonly label: string;
  readonly api: string;
  readonly chatId?: ChatId | undefined;
  readonly plan: WirePlan | null;
  readonly prefillAllowed: boolean;
  /** What body rule 5b tells the template's thinking switch; `undefined` leaves the server's default. */
  readonly templateThinking: boolean | undefined;
  /** What body rule 5c tells the template about replaying prior thinking; `undefined` sends nothing. */
  readonly templatePreserveReasoning: boolean | undefined;
  /** The effort the funnel resolved, for a route that spells effort in its own words rather than the V4 one (Ollama's
   *  native `think`, where `max` is not the OpenAI route's `xhigh`). */
  readonly reasoningEffort?: EffortLevel | undefined;
  /** Sees each native body as it goes out (after the user's body), so a turn records what was sent. */
  readonly onNativeBody?: ((body: Readonly<Record<string, unknown>>) => void) | undefined;
  /** Fold consecutive plain same-role rows into one message of parts (`body.ts` rule 10). */
  readonly foldSameRole: boolean;
  readonly replyImages: boolean;
  readonly warnings: ResolvedWarning[];
  /** Body-level fields the SDK does not model that this call must carry (the unmodelled sampler knobs, OR routing). */
  readonly extraBody?: Readonly<Record<string, unknown>> | undefined;
  /** The openrouter chat settings the SDK models at the MODEL level (ignored on the other transport). */
  readonly openRouterChat?: { readonly strict?: boolean | undefined; readonly parallelToolCalls?: boolean | undefined } | undefined;
  /** The preset's inline-reasoning tag pair; drives the `extractReasoningMiddleware` wrap (see `think-tags.ts`). */
  readonly reasoningTags?: ReasoningTags | undefined;
}

function dialectOf(call: ModelCall): Dialect {
  // Validated by the provider schema's superRefine: an openai-compat row always names its dialect.
  return call.connection.provider.dialect ?? "openai-compatible";
}

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

/** A row whose folded `features.nativeChat` is `ollama` (D296): the same SDK and the same body shaping, with
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

function openRouterProvider(call: ModelCall): ReturnType<typeof createOpenRouter> {
  const { connection, deps } = call;
  const args = shapeArgs(call, "openrouter");
  const shapeBody = (body: Record<string, unknown>): Record<string, unknown> => shapeOutboundBody({ ...body, ...(call.extraBody ?? {}) }, args);
  return createOpenRouter({
    baseURL: baseUrlOf(call),
    ...(connection.credential.secret !== null ? { apiKey: connection.credential.secret } : {}),
    headers: { [OR_REFERER_HEADER]: deps.app.url, [OR_TITLE_HEADER]: deps.app.name },
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
      openRouterProvider(call).chat(call.connection.model, {
        usage: { include: true },
        ...(call.openRouterChat?.strict !== undefined ? { structuredOutputs: { strict: call.openRouterChat.strict } } : {}),
        ...(call.openRouterChat?.parallelToolCalls !== undefined ? { parallelToolCalls: call.openRouterChat.parallelToolCalls } : {}),
      }),
    embedding: (call) =>
      openRouterProvider(call).textEmbeddingModel(call.connection.model, { ...(call.extraBody !== undefined ? { extraBody: { ...call.extraBody } } : {}) }),
    image: (call) =>
      openRouterProvider(call).imageModel(call.connection.model, { ...(call.extraBody !== undefined ? { extraBody: { ...call.extraBody } } : {}) }),
  },
};

export function languageModelFor(call: ModelCall): LanguageModelV4 {
  const model =
    call.connection.features.nativeChat === "ollama" ? ollamaNativeProvider(call).chatModel(call.connection.model) : TRANSPORTS[dialectOf(call)].language(call);
  // The F-table "Adopt" row: a server with NO native reasoning field and an XML-shaped preset tag pair gets
  // the SDK's stream-time splitter. Empty list ⇒ the bare model, so every other row is byte-identical and
  // pays no wrapper (`wrapLanguageModel` with no middleware would still be a layer on every turn).
  const middleware = thinkTagMiddleware({ reasoningKeys: call.connection.features.reasoningKeys, tags: call.reasoningTags });
  return middleware.length === 0 ? model : wrapLanguageModel({ model, middleware });
}

export function embeddingModelFor(call: ModelCall): EmbeddingModelV4 {
  return TRANSPORTS[dialectOf(call)].embedding(call);
}

export function imageModelFor(call: ModelCall): ImageModelV4 {
  return TRANSPORTS[dialectOf(call)].image(call);
}
