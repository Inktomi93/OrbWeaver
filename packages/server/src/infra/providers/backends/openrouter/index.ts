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
import { scrubWireSchema } from "@orb/kit/json-schema";
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
  WireTool,
} from "../../contract/index.ts";
import { ProviderError } from "../../contract/index.ts";
import type { ChatCompletionResult, NormalizeImageBytes } from "../kit/index.ts";
import {
  extractChatRefusal,
  extractChatReply,
  logProviderSummarizeItem,
  parseChatCompletionResult,
  passthroughImageNormalizer,
  providerLog,
} from "../kit/index.ts";
import { getOpenRouterCredits, getOpenRouterGenerationCost } from "./account.ts";
import { fetchOrCatalog } from "./catalog.ts";
import type { OrClient } from "./client.ts";
import { createClientCache } from "./client.ts";
import { requireOpenRouterApiKey } from "./credential-guard.ts";
import { probeOpenRouterCredential } from "./probe.ts";
import { runChatCompletionTurn } from "./runners/chat/chat-completions.ts";
import { runResponsesTurn } from "./runners/chat/responses.ts";
import type { OpenRouterChatDeps } from "./runners/chat/shared.ts";
import { buildToolChoice, buildWireTools } from "./runners/chat/shared.ts";
import { runEmbed } from "./runners/embed/runner.ts";
import { runGenerateImage, runImageEmbed, toImageUrl } from "./runners/image/runner.ts";
import { runRerank } from "./runners/rerank/runner.ts";

export { getOpenRouterCredits, getOpenRouterGenerationCost } from "./account.ts";
export { fetchOrCatalog } from "./catalog.ts";
export type { OrClient } from "./client.ts";
export { createClientCache, createOpenRouterClient } from "./client.ts";
export { requireOpenRouterApiKey } from "./credential-guard.ts";
export { probeOpenRouterCredential } from "./probe.ts";
export {
  placeHistoryCacheBreakpoint,
  runChatCompletionTurn,
} from "./runners/chat/chat-completions.ts";
export { withContextCompressionPlugin } from "./runners/chat/context-compression.ts";
export { runResponsesTurn } from "./runners/chat/responses.ts";
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
} from "./runners/chat/shared.ts";
export { runEmbed } from "./runners/embed/runner.ts";
export { runGenerateImage, runImageEmbed } from "./runners/image/runner.ts";
export { runRerank } from "./runners/rerank/runner.ts";

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

// ── THE STRUCTURED VEHICLE IS A FORCED TOOL CALL, NOT `response_format` (live-probed 2026-08-02) ──────
// OpenRouter's `response_format: {type:"json_schema"}` is NOT servable across its hosted families, so the
// `structured` role cannot use it. Measured against the REAL rpg extraction schema (the host `resyncFromStory`
// door died on exactly this — it 400'd every time and the failure was swallowed as "nothing to resync"):
//   • anthropic (`claude-sonnet-5`, the owner's DEFAULT hosted model) — 400 on `strict:true` AND `strict:false`.
//     First "output_config.format.schema: For 'integer' type, properties maximum, minimum are not supported"
//     (zod's `z.int()` projects safe-integer bounds); strip those and it 400s again with "Schemas contains too
//     many optional parameters (46), which would make grammar compilation inefficient". An extraction schema is
//     optional-by-construction (omit = keep), so that second wall is unclearable — the vehicle is simply wrong.
//     KEYWORD-SUBSET CORRECTION (docs read 2026-08-03): the integer-bounds 400 above is the SMALLER of four
//     unsupported keyword classes we were emitting, and the probe simply stopped at the first one. The measured
//     population on the real extraction schema is `minLength` ×16 (banned by BOTH vendors), `maxLength` ×1,
//     `minimum`/`maximum` ×8 each (Anthropic bans, OpenAI allows), plus `$schema` (in neither documented
//     subset). All four now come off the wire copy at the request-build site (`scrubWireSchema`,
//     "hosted-common") while zod keeps them as the runtime validator. That does NOT reopen the vehicle
//     question: the optional-count wall is untouched by it, and the forced tool remains the servable shape.
//   • openai (`gpt-5.4-mini`) — 400 on `strict:true` ("'required' is required to be supplied"); 200 non-strict.
//   • google (`gemini-3.5-flash`) — 200 on both.
// The SAME JSON Schema carried as ONE forced tool call is 200 on ALL THREE. It is also the vehicle the in-turn
// folded round already drives on this wire (D112), so both rpg write paths now ride one wire shape. The role's
// CONTRACT is unchanged — the caller still hands a `ResponseFormat` and still gets JSON text back; only the
// dialect this backend speaks it in changed (Tier-3b: "each backend internalizes ALL its own quirks").
// `ResponseFormat.name` is already documented as "OpenAI `json_schema.name`; Anthropic tool name".

/** The description the forced tool carries when the caller supplied none. A tool with no description is a
 *  measurably worse prompt on every family, and the structured role's callers describe the SCHEMA, not the act. */
const STRUCTURED_TOOL_DESCRIPTION = "Record the result. Call this tool exactly once, with the complete result object.";

/** One `ResponseFormat` → the single wire tool the structured call forces. The schema rides in the HOSTED-COMMON
 *  keyword subset (the ONE scrub engine, `@orb/kit/json-schema`): OpenRouter routes per PROVIDER, not per model,
 *  so a request cannot know whether it lands on the endpoint that refuses string bounds (both vendors) or
 *  numeric bounds (Anthropic) — the strictest common subset is the only honest payload. Nothing is lost:
 *  the caller's zod schema still validates the reply against the FULL bounded shape. */
function structuredWireTool(format: ResponseFormat): WireTool {
  return {
    name: format.name,
    description: format.description ?? STRUCTURED_TOOL_DESCRIPTION,
    parameters: scrubWireSchema(format.schema, "hosted-common").schema,
  };
}

/** The structured item's reply: the forced call's raw `arguments` JSON string, plus the names of any EXTRA calls
 *  the same turn emitted. Falls back to the prose reply when the model answered in content anyway (some wires
 *  ignore `tool_choice`) — the caller's salvage parse then gets the same shot it always had, instead of an empty
 *  string it can only read as "the model wrote nothing".
 *
 *  `extra` is never silently discarded (D112 (3), banned-silent-fork): `parallel_tool_calls:false` rides on
 *  every structured request, so a second call means the endpoint IGNORED the knob — the caller's schema binds
 *  ONE result object and the second one's content would vanish. It is reported, not dropped in silence. */
function structuredReply(view: ChatCompletionResult, toolName: string): { readonly text: string; readonly extra: readonly string[] } {
  const calls = view.choices?.[0]?.message?.toolCalls;
  // The forced tool's own call, else the first one (some wires answer with a differently-named call).
  const chosen = Math.max(calls?.findIndex((c) => c.function.name === toolName) ?? -1, 0);
  const call = calls?.[chosen];
  const extra = (calls ?? []).filter((_c, i) => i !== chosen).map((c) => c.function.name);
  return { text: call === undefined ? extractChatReply(view) : call.function.arguments, extra };
}

// Build ONE item's SDK chat request (system + the possibly-multimodal user content + the sampling knobs + —
// on the structured role — the forced schema-carrying tool).
async function buildOrBatchRequest(deps: OrBatchDeps, req: OrBatchReq, input: SummarizeRequestItem): Promise<SdkChatRequest> {
  const tool = req.responseFormat !== undefined ? structuredWireTool(req.responseFormat) : undefined;
  const userContent = await summarizeUserContent(input, deps.normalize);
  return {
    model: req.model,
    messages: [
      { role: SYSTEM_ROLE, content: input.systemPrompt },
      { role: USER_ROLE, content: userContent },
    ],
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.maxTokens !== undefined ? { maxCompletionTokens: req.maxTokens } : {}),
    // The forced structured call is a SINGLE-RESULT vehicle: the caller's schema describes one object, and a
    // second call's payload has nowhere to go. `parallel_tool_calls:false` is the vendor's own knob for that
    // (Anthropic spells it `disable_parallel_tool_use`; this wire is OpenAI-dialect and the SDK maps it), so
    // the duplicate is PREVENTED here rather than merely reported at the read (which is also done — see
    // `structuredReply`, for the endpoint that ignores the knob).
    ...(tool !== undefined ? { tools: buildWireTools([tool]), toolChoice: buildToolChoice({ mode: "tool", name: tool.name }), parallelToolCalls: false } : {}),
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
    // A REFUSAL IS A FIRST-CLASS FIELD ON THIS WIRE, and it is NOT schema-shaped (both vendors document it as
    // arriving INSTEAD of the schema). Read as a normal reply it lands as a 200 `ok:true` item whose text can
    // only fail the caller's salvage parse — indistinguishable from "the model wrote garbage", which is exactly
    // the silent fork D112 (3) bans. Raising it here turns it into the caller's errors-as-data refusal arm
    // (`{ok:false, reason}` — the RESYNC-OR/POPLOUD grammar) carrying the vendor's OWN sentence.
    const refusal = extractChatRefusal(view);
    if (refusal !== "") {
      throw new ProviderError({ kind: "refused", retryable: false, message: `the model refused: ${refusal}`, model: req.model });
    }
    // S3 — skip the CoT strip on the STRUCTURED role (constrained output IS pure JSON; a literal `<think>` there
    // is a legitimate JSON string value, e.g. journal content quoting the tag — stripping would corrupt it). The
    // prose (summarize) path still strips loose `<think>…</think>` scaffolding.
    let text: string;
    if (req.responseFormat === undefined) {
      text = extractChatReply(view).replace(THINK_BLOCK_RE, "").trim();
    } else {
      const reply = structuredReply(view, req.responseFormat.name);
      text = reply.text.trim();
      if (reply.extra.length > 0) {
        providerLog(OR_BACKEND, "warn", "provider.structured-extra-call", {
          role: req.role,
          model: req.model,
          index,
          droppedCalls: reply.extra,
        });
      }
    }
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
