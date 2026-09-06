// The stateless remote chat backend + the non-chat roles OpenRouter serves (embed/rerank/imageEmbed/
// generateImage) + the summarize shaper over chat. No `runAgentTurn` (agent mode is agent-sdk's).

import type { ChatContentItems, ChatFormatJsonSchemaConfig, ChatUserMessageContent, ChatRequest as SdkChatRequest } from "@openrouter/sdk/models";
import { ChatRequest$outboundSchema } from "@openrouter/sdk/models";
import type { ResponseFormat } from "@orb/contracts/role-clients";
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
  ProviderScrubSet,
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
  extractHttpErrorDiagnostic,
  logProviderSummarizeItem,
  parseChatCompletionResult,
  passthroughImageNormalizer,
  providerCredentialSecretValues,
  providerErrorFromHttp,
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
  readonly secrets: ProviderScrubSet;
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
  const chosen = calls?.findIndex((c) => c.function.name === toolName) ?? -1;
  if (calls !== undefined && calls.length > 0 && chosen < 0) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `openrouter structured response called "${calls[0]?.function.name ?? "unnamed"}" instead of forced tool "${toolName}"`,
    });
  }
  const call = calls?.[chosen];
  const extra = (calls ?? []).filter((_c, i) => i !== chosen).map((c) => c.function.name);
  return { text: call === undefined ? extractChatReply(view) : call.function.arguments, extra };
}

// ── THE SECOND VEHICLE — `response_format: json_schema`, re-opened by live probe (2026-08-09) ──────────
// The block above records a 2026-08-02 probe as "`response_format` is NOT servable across its hosted
// families". That wording is CORRECTED, not deleted, and the correction names the real variable: it is the
// schema SHAPE, never the endpoint-routing knob.
//
// Measured 2026-08-09 with the owner's key, 23 live calls, three families (receipts:
// `docs/history/reviews/misc/2026-08-09-openrouter-structured-output-probe.md`):
//   • the SAME `response_format` field that 400'd in 2026-08-02 is 200 on anthropic-, openai- AND
//     google-family endpoints when the schema rides the ALL-REQUIRED shape (`scrubWireSchema(…,
//     "strict-compatible")`) with `strict:true`. openai's 400 was literally "'required' is required to be
//     supplied and to be an array including every key in properties" — i.e. the D126 knob's own documented
//     wall, and D126 is its own documented fix.
//   • `provider.require_parameters:true` changed NO cell of the 2026-08-09 matrix — TRUE THEN, FALSE NOW.
//     CORRECTED 2026-08-14: OR's provider-routing changed, and `require_parameters:true` now flips EVERY cell
//     200 → HTTP 404 "No endpoints found that can handle the requested parameters" (it demands an endpoint
//     advertising the full request-parameter set and finds none). It was hardcoded on this path and was the
//     sole breaker of all hosted `response_format` structured output; it is now OMITTED here (see the
//     request-build site below). A hosted wire fact has a shelf life — this bullet is the receipt.
//   • the optional-COUNT wall the 2026-08-02 note reports for the rpg extraction schema is untouched by
//     this: `strict-compatible` is exactly what clears it, at the cost of one explicit `null` per unset
//     field. Which is why the vehicle is a KNOB and `auto` keeps the forced tool for callers who have not
//     opted into the strict shape — the extraction rail's behaviour is unchanged by default.
//
// The forced tool therefore STAYS as the other arm and as `auto`'s fallback (nothing was ripped out); a
// caller that needs a real grammar asks for `vehicle:"response-format"` per call, as the schema-forge does.

/** The `response_format` vehicle's wire copy: the ALL-REQUIRED shape + `strict:true` — the ONE pairing the
 *  probe found servable on all three families. Deliberately NOT `buildChatResponseFormat` (the chat runners'
 *  builder, which carries the hosted-common shape and omits `strict` by ruling): that builder answers a
 *  different question for a different rail, and merging them would make one of the two lie. */
function structuredResponseFormat(format: ResponseFormat): ChatFormatJsonSchemaConfig {
  return {
    type: "json_schema",
    jsonSchema: {
      name: format.name,
      schema: scrubWireSchema(format.schema, "strict-compatible").schema,
      strict: true,
      ...(format.description !== undefined ? { description: format.description } : {}),
    },
  };
}

/** Which vehicle THIS request rides. The per-call ask wins; `auto` resolves at the CALLER (role-clients
 *  reads the resolved model's capability) and arrives here already decided, so an `auto` reaching this
 *  point means nobody could answer — the forced tool is the servable-everywhere answer. */
function vehicleOf(format: ResponseFormat): "response-format" | "forced-tool" {
  return format.vehicle === "response-format" ? "response-format" : "forced-tool";
}

// Build ONE item's SDK chat request (system + the possibly-multimodal user content + the sampling knobs + —
// on the structured role — whichever schema vehicle this request rides).
async function buildOrBatchRequest(deps: OrBatchDeps, req: OrBatchReq, input: SummarizeRequestItem): Promise<SdkChatRequest> {
  const vehicle = req.responseFormat === undefined ? undefined : vehicleOf(req.responseFormat);
  const tool = req.responseFormat !== undefined && vehicle === "forced-tool" ? structuredWireTool(req.responseFormat) : undefined;
  const userContent = await summarizeUserContent(input, deps.normalize);
  return {
    model: req.model,
    messages: [
      { role: SYSTEM_ROLE, content: input.systemPrompt },
      { role: USER_ROLE, content: userContent },
    ],
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.maxTokens !== undefined ? { maxCompletionTokens: req.maxTokens } : {}),
    // The `response_format` vehicle carries the schema ONLY — it does NOT ride `provider.require_parameters`.
    // That flag was hardcoded `true` here on 2026-08-09 (commit e916b25a2) as "routing hygiene": force OR
    // toward an endpoint that advertises every request parameter. OR's provider-routing has CHANGED since:
    // as of 2026-08-14 `require_parameters:true` makes OR demand an endpoint advertising the FULL request-
    // parameter set and find NONE → HTTP 404 "No endpoints found that can handle the requested parameters",
    // on EVERY family and EVERY schema — the entire hosted `response_format` structured path was 100% broken.
    // A single-variable raw-replay of the captured wire proved it (present ⇒ 404; absent ⇒ 200 with valid
    // schema-honoring JSON; `docs/reviews/misc/2026-08-14-refinery-custom-schema-drive.md` "ARM 8 REAL-BUG").
    // Omitting it does NOT reopen the "routed to a provider that ignores the schema" risk: OR applies
    // `response_format` (incl. structured outputs) as a DEFAULT soft routing preference — a request is
    // preferentially routed to the supporting providers even with `require_parameters` unset (OR
    // provider-routing docs, "Default parameter preferences", read 2026-08-14). `require_parameters` is a real
    // per-connection knob (`contracts/connection.openRouterProviderRoutingSchema.require_parameters`), and the
    // CHAT path honors it OPTIONALLY (`runners/chat/shared.ts` — sent only when the connection sets it, never
    // hardcoded). This structured path matches that DEFAULT (absent); it does not re-hardcode the breaker.
    ...(req.responseFormat !== undefined && vehicle === "response-format" ? { responseFormat: structuredResponseFormat(req.responseFormat) } : {}),
    // The forced structured call is a SINGLE-RESULT vehicle: the caller's schema describes one object, and a
    // second call's payload has nowhere to go. `parallel_tool_calls:false` is the vendor's own knob for that
    // (Anthropic spells it `disable_parallel_tool_use`; this wire is OpenAI-dialect and the SDK maps it), so
    // the duplicate is PREVENTED here rather than merely reported at the read (which is also done — see
    // `structuredReply`, for the endpoint that ignores the knob).
    ...(tool !== undefined ? { tools: buildWireTools([tool]), toolChoice: buildToolChoice({ mode: "tool", name: tool.name }), parallelToolCalls: false } : {}),
  };
}

// One failed batch item → the thrown, cause-chained ProviderError, with OpenRouter's OWN status + body
// surfaced. A refusal (already a typed ProviderError) is reframed with the item's coordinates through
// `rewrap`, so EVERY carried field survives — not just kind/retryable, but the `resetsAt` a backoff honors,
// the upstream status, the model and the request id (the hand-rolled re-mint this replaced dropped them all). A raw OpenRouter/SDK HTTP failure is classified through the shared HTTP table
// (`providerErrorFromHttp` — a 404 is `model_unavailable` + non-retryable, NOT the retryable `server` a bare
// re-throw used to guess) AND carries OR's raw response body: the Speakeasy client throws a
// `ResponseValidationError` whose `.message` is the generic "Response validation failed" and SWALLOWS OR's
// `{error}` envelope (e.g. a 404 "No endpoints found that can handle the requested parameters"). That body
// rides `err.body` (`OpenRouterError.body`), so `extractHttpErrorDiagnostic` peels it out sanitized — the
// next hosted-structured failure is diagnosable instead of opaque (D-ARM8-2 / the `instruments-lie` class:
// an upstream 404 was presenting as an internal validation error, which is exactly why the earlier probe
// "couldn't get the response body").
function orBatchProviderError(role: "summarize" | "structured", index: number, err: unknown, secrets: ProviderScrubSet): ProviderError {
  const prefix = `openrouter ${role} item ${index} failed`;
  if (err instanceof ProviderError) {
    // `rewrap`, never a hand-rolled re-mint: the item coordinates are a message prefix, and a prefix is not a
    // reason to drop `resetsAt`/`apiErrorStatus`/`model`/`requestId` (the batch caller's backoff reads them).
    return err.rewrap(`${prefix}: ${err.message}`);
  }
  const classified = providerErrorFromHttp(err, prefix, secrets);
  const body = extractHttpErrorDiagnostic(err, secrets).body;
  if (body === undefined) {
    return classified;
  }
  // Same rule on the classified arm: appending OR's raw body is a message edit, so every field the HTTP
  // classifier established rides through (this used to hand-carry `apiErrorStatus` alone).
  return classified.rewrap(`${classified.message} — upstream body: ${body}`);
}

// The failed-item log + the re-thrown ProviderError (batch rejects exactly as before). The logged
// `errorKind` is the CLASSIFIED kind (so a hosted 404 records `model_unavailable`, not the old `unknown`).
function throwOrBatchFailure(args: {
  readonly role: "summarize" | "structured";
  readonly model: string;
  readonly index: number;
  readonly durationMs: number;
  readonly hasResponseFormat: boolean;
  readonly err: unknown;
  readonly secrets: ProviderScrubSet;
}): never {
  const { role, model, index, durationMs, hasResponseFormat, err, secrets } = args;
  const providerError = orBatchProviderError(role, index, err, secrets);
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
    errorKind: providerError.kind,
  });
  throw providerError;
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
    return throwOrBatchFailure({ role: req.role, model: req.model, index, durationMs: deps.now() - startedAt, hasResponseFormat, err, secrets: deps.secrets });
  }
}

// ONE chat turn per input, run sequentially — OpenRouter's per-key rate limits make a parallel fan-out
// trip 429s. Shared by the `summarize` + `structured` roles (one wire home). An item carrying `images`
// becomes a multimodal user message (text + `image_url` parts); text-only items stay a plain-string turn.
async function runOrBatch(deps: OrBatchDeps, req: OrBatchReq): Promise<SummarizeResult> {
  const items: SummarizeResult["items"] = [];
  for (const [index, input] of req.inputs.entries()) {
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
  const batchDeps = (client: OrClient, credential: EmbedRequest["credential"]): OrBatchDeps => ({
    client,
    secrets: providerCredentialSecretValues(credential),
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
      await runOrBatch(batchDeps(clientFor(req.credential, "summarize"), req.credential), {
        model: req.model,
        role: "summarize",
        inputs: req.inputs,
        responseFormat: undefined,
        temperature: req.temperature,
        maxTokens: req.maxTokens,
        signal: req.signal,
      }),
    structured: async (req: StructuredRequest): Promise<SummarizeResult> =>
      await runOrBatch(batchDeps(clientFor(req.credential, "structured"), req.credential), {
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
    probe: async (req: ProbeRequest): Promise<CredentialHealth> =>
      await probeOpenRouterCredential(clientFor(req.credential, "probe"), deps.now, providerCredentialSecretValues(req.credential)),
    accountCredits: async (req: AccountCreditsRequest): Promise<AccountCredits> =>
      await getOpenRouterCredits(clientFor(req.credential, "accountCredits"), providerCredentialSecretValues(req.credential), req.signal),
    generationCost: async (req: GenerationCostRequest): Promise<GenerationCost> =>
      await getOpenRouterGenerationCost(
        clientFor(req.credential, "generationCost"),
        req.generationId,
        providerCredentialSecretValues(req.credential),
        req.signal,
      ),
    fetchCatalog: async (req: FetchCatalogRequest): Promise<ModelCatalogEntry[]> => await fetchOrCatalog(getClient(""), req.signal),
  };
}
