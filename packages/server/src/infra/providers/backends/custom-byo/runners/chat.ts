// ONE chat turn against a user-wired, OpenAI-compatible endpoint: a dumb raw-fetch proxy whose entire
// behaviour is the user's config. Model profile reads from req.capability (never a baked constant);
// response shape reshapes through a declared dot-path map so a non-standard reply still maps cleanly.
//
// The generation knobs ride the SAME funnel every hosted runner uses: `resolveChat(params, capability)`
// decides effort (incl. the quality fallback + the mandatory-reasoning clamp), capability-gates + clamps
// sampling, and clamps the output cap — this backend never re-derives that policy, it only projects the
// resolved result onto ITS wire vocab (`max_tokens`, `reasoning_effort`) and reports every degrade as a
// `warning` event. The preset's `customParameters` escape hatch still merges AFTER resolution (BYOK-only by
// design), so a user can always re-add or override a field the funnel dropped.

import type { ChatContentPart } from "@orb/contracts/chat";
import type { CustomOpenAiResponseMap, ResolvedCredential } from "@orb/contracts/credentials";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { deepMergeRequestBody } from "@orb/server/kit/custom-parameters";
import type {
  ChatEvent,
  ChatHistoryMessage,
  ChatRequest,
  ChatResult,
  ResolvedChatKnobs,
  ResolvedReasoning,
  ResolvedWarning,
  WireCaptureSink,
} from "../../../contract/index.ts";
import { ProviderError } from "../../../contract/index.ts";
import { resolveChat } from "../../../resolve-chat.ts";
import type { ChatCompletionStreamChunk, OpenAiSamplingInput, StreamReduceOptions } from "../../kit/index.ts";
import {
  applyIncludeExclude,
  buildOpenAiSamplingFields,
  chatHistoryText,
  effortToOpenAIReasoning,
  mapChatCompletionToTurnResult,
  parseOpenAiSse,
  providerErrorFromHttp,
  rawResponseFormat,
  rawToolCallDeltas,
  rawToolChoice,
  rawWireTools,
  redactSecretsFromText,
  reduceChatCompletionStream,
  runWithPreCommitRetry,
  secretHeaderValues,
  turnAbortSignal,
} from "../../kit/index.ts";

export interface CustomByoRunnerDeps {
  readonly now: () => number;
  readonly random?: (() => number) | undefined;
  readonly captureWire?: WireCaptureSink | undefined;
}

type ChatCompletionsRequest = Extract<ChatRequest, { readonly api: "chat-completions" }>;

const CHAT_COMPLETIONS_PATH = "/chat/completions";
const JSON_CONTENT_TYPE = "application/json";
const SYSTEM_ROLE = "system";
const TRAILING_SLASH_RE = /\/$/u;

// A dot-path addresses one JSON value; a numeric segment indexes an array.
interface ResponseMap {
  readonly contentPath: string;
  readonly reasoningPath?: string | undefined;
  readonly finishReasonPath?: string | undefined;
  readonly promptTokensPath?: string | undefined;
  readonly completionTokensPath?: string | undefined;
  readonly errorMessagePath?: string | undefined;
  readonly errorCodePath?: string | undefined;
  readonly toolCallsPath?: string | undefined;
}

const STREAM_DEFAULT_MAP: ResponseMap = {
  contentPath: "choices.0.delta.content",
  reasoningPath: "choices.0.delta.reasoning",
  finishReasonPath: "choices.0.finish_reason",
  promptTokensPath: "usage.prompt_tokens",
  completionTokensPath: "usage.completion_tokens",
  errorMessagePath: "error.message",
  errorCodePath: "error.code",
  toolCallsPath: "choices.0.delta.tool_calls",
};
const BODY_DEFAULT_MAP: ResponseMap = {
  contentPath: "choices.0.message.content",
  reasoningPath: "choices.0.message.reasoning",
  finishReasonPath: "choices.0.finish_reason",
  promptTokensPath: "usage.prompt_tokens",
  completionTokensPath: "usage.completion_tokens",
  errorMessagePath: "error.message",
  errorCodePath: "error.code",
  toolCallsPath: "choices.0.message.tool_calls",
};

// Overlay the user's declared paths onto a default map — only a SET override path replaces the default,
// so a partial map (e.g. only `contentPath`) keeps the OpenAI-compatible defaults for the rest.
function withResponseMap(base: ResponseMap, override: CustomOpenAiResponseMap | null): ResponseMap {
  if (override === null) {
    return base;
  }
  return {
    contentPath: override.contentPath ?? base.contentPath,
    reasoningPath: override.reasoningPath ?? base.reasoningPath,
    finishReasonPath: override.finishReasonPath ?? base.finishReasonPath,
    promptTokensPath: override.promptTokensPath ?? base.promptTokensPath,
    completionTokensPath: override.completionTokensPath ?? base.completionTokensPath,
    errorMessagePath: override.errorMessagePath ?? base.errorMessagePath,
    errorCodePath: override.errorCodePath ?? base.errorCodePath,
    toolCallsPath: override.toolCallsPath ?? base.toolCallsPath,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function readPath(root: unknown, path: string | undefined): unknown {
  if (path === undefined) {
    return;
  }
  let cur: unknown = root;
  for (const seg of path.split(".")) {
    if (!isRecord(cur)) {
      return;
    }
    cur = cur[seg];
  }
  return cur;
}

function readString(root: unknown, path: string | undefined): string | undefined {
  const value = readPath(root, path);
  return typeof value === "string" ? value : undefined;
}

function readNumber(root: unknown, path: string | undefined): number | undefined {
  const value = readPath(root, path);
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function reshapeChunk(raw: unknown, map: ResponseMap): ChatCompletionStreamChunk {
  const content = readString(raw, map.contentPath);
  const reasoning = readString(raw, map.reasoningPath);
  const finishReason = readString(raw, map.finishReasonPath) ?? null;
  const promptTokens = readNumber(raw, map.promptTokensPath);
  const completionTokens = readNumber(raw, map.completionTokensPath);
  const errorMessage = readString(raw, map.errorMessagePath);

  const usage =
    promptTokens !== undefined || completionTokens !== undefined
      ? {
          ...(promptTokens !== undefined ? { promptTokens } : {}),
          ...(completionTokens !== undefined ? { completionTokens } : {}),
        }
      : undefined;
  const error = errorMessage !== undefined ? { message: errorMessage, code: readNumber(raw, map.errorCodePath) ?? 0 } : undefined;
  const toolCalls = rawToolCallDeltas(readPath(raw, map.toolCallsPath));
  return {
    choices: [
      {
        delta: {
          content: content ?? null,
          ...(reasoning !== undefined ? { reasoning } : {}),
          ...(toolCalls !== undefined ? { toolCalls } : {}),
        },
        finishReason,
      },
    ],
    ...(error !== undefined ? { error } : {}),
    ...(usage !== undefined ? { usage } : {}),
  };
}

// The funnel's capability-gated + clamped sampling → the shared OpenAI-compat sampler input. WIRE VOCAB IS
// THIS BACKEND'S: `buildOpenAiSamplingFields` spells the broadest OpenAI-compatible names (`max_tokens`,
// `top_p`, …) — never OpenRouter's `max_completion_tokens`, which an arbitrary BYO server would reject.
function samplingFromResolved(resolved: ResolvedChatKnobs): OpenAiSamplingInput {
  const s = resolved.sampling;
  return {
    temperature: s.temperature,
    topP: s.topP,
    topK: s.topK,
    frequencyPenalty: s.frequencyPenalty,
    presencePenalty: s.presencePenalty,
    repetitionPenalty: s.repetitionPenalty,
    minP: s.minP,
    topA: s.topA,
    seed: s.seed,
    logitBias: s.logitBias,
    stop: s.stop,
    maxTokens: resolved.maxOutputTokens,
  };
}

// The resolved reasoning → `reasoning_effort`, the ONE reasoning knob an arbitrary OpenAI-compatible server
// understands (OpenAI chat-completions vocab; OR's nested `reasoning` object is gateway-specific and would be
// an unknown key here). Emitted ONLY when the funnel actually resolved an effort the capability supports:
//   • capability without reasoning, or an effort the model's allowlist rejects ⇒ NO field (and the funnel
//     already emitted the visible `effort_dropped` warning) — a non-reasoning endpoint's body therefore stays
//     byte-identical to the pre-funnel shape, never a blanket `reasoning_effort:"none"`.
//   • budget mode resolves a token budget instead of an effort; this wire has no budget field, so nothing is
//     emitted and {@link budgetDropWarning} makes that drop loud.
// `effortToOpenAIReasoning` owns the level vocab (our `max` → the wire's `xhigh`) — never re-spelled here.
function reasoningFields(reasoning: ResolvedReasoning): Record<string, unknown> {
  if (!reasoning.enabled || reasoning.effort === undefined) {
    return {};
  }
  return { reasoning_effort: effortToOpenAIReasoning({ enabled: true, effort: reasoning.effort }).effort };
}

const VERBOSITY_DROPPED = "verbosity ignored: the OpenAI-compatible chat-completions wire has no verbosity field";
const REASONING_BUDGET_DROPPED = "thinkingBudgetTokens ignored: the OpenAI-compatible chat-completions wire has no reasoning-budget field";
const TOOL_RESULT_ERROR_DROPPED = "tool-result isError ignored: the OpenAI-compatible chat-completions wire has no tool-result error field";

// D41 no-silent-degrade: three signals survive into this runner but have NO slot on this wire — a resolved
// verbosity, a budget-mode reasoning budget, and a tool result's `isError` flag (the OpenAI `tool` message is
// {role,tool_call_id,content} and nothing else, so a failed tool result reads to the model as an ordinary
// one). Fold all three onto the funnel's own warnings so each drop is observable on the turn, never silent.
// `customParameters`/`includeBody` remain the user's way to send whatever field their endpoint actually speaks.
function turnWarnings(resolved: ResolvedChatKnobs, history: readonly ChatHistoryMessage[]): readonly ResolvedWarning[] {
  const warnings = [...resolved.warnings];
  if (resolved.verbosity !== undefined) {
    warnings.push({ code: "verbosity_dropped", message: VERBOSITY_DROPPED });
  }
  if (resolved.reasoning.budgetTokens !== undefined) {
    warnings.push({ code: "sampling_knob_dropped", message: REASONING_BUDGET_DROPPED });
  }
  if (history.some((turn) => turn.content.some((part) => part.type === "tool-result" && part.isError === true))) {
    warnings.push({ code: "tool_result_error_dropped", message: TOOL_RESULT_ERROR_DROPPED });
  }
  return warnings;
}

// ResolvedWarning → the turn's `warning` events — the same channel the hosted runners report degrades on
// (fired on `onEvent` as the turn completes AND carried on the result).
function warningEvents(warnings: readonly ResolvedWarning[], at: number): ChatEvent[] {
  return warnings.map(({ code, message }) => ({ kind: "warning", at, code, message }));
}

function rawHistoryToolCalls(content: readonly ChatContentPart[]): Record<string, unknown>[] {
  const calls: Record<string, unknown>[] = [];
  for (const part of content) {
    if (part.type === "tool-call") {
      calls.push({
        id: part.toolCallId,
        type: "function",
        function: { name: part.name, arguments: part.arguments },
      });
    }
  }
  return calls;
}

// One `tool` message per tool-result part. The part's `isError` has no field here (this wire's tool message is
// role/tool_call_id/content and nothing else) — {@link turnWarnings} makes that drop loud (D41).
function rawToolResultMessages(content: readonly ChatContentPart[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const part of content) {
    if (part.type === "tool-result") {
      out.push({ role: "tool", tool_call_id: part.toolCallId, content: part.content });
    }
  }
  return out;
}

function rawTurnMessage(turn: ChatHistoryMessage): Record<string, unknown> | null {
  const text = chatHistoryText(turn.content);
  const toolCalls = turn.role === "assistant" ? rawHistoryToolCalls(turn.content) : [];
  if (text.trim().length === 0 && toolCalls.length === 0) {
    return null;
  }
  return {
    role: turn.role,
    content: text,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    ...(turn.name !== undefined ? { name: turn.name } : {}),
  };
}

function buildMessages(req: ChatCompletionsRequest): readonly Record<string, unknown>[] {
  const systemText = [req.systemPrompt.static.trim(), req.systemPrompt.dynamic.trim()].filter((part) => part.length > 0).join("\n\n");
  const messages: Record<string, unknown>[] = [];
  if (systemText.length > 0) {
    messages.push({ role: SYSTEM_ROLE, content: systemText });
  }
  for (const turn of req.history) {
    if (turn.role === "tool") {
      messages.push(...rawToolResultMessages(turn.content));
      continue;
    }
    const message = rawTurnMessage(turn);
    if (message !== null) {
      messages.push(message);
    }
  }
  return messages;
}

// Layering (last wins): the RESOLVED funnel fields → the preset's `customParameters` deep-merge (the BYOK
// escape hatch — a user override still beats a resolved value, and can re-add a field the funnel dropped) →
// the user's per-endpoint request transforms (PD-13), so `includeBody`/`excludeBody` are the endpoint's final
// word (a field the server rejects is stripped even if a preset re-added it).
function buildBody(
  req: ChatCompletionsRequest,
  resolved: ResolvedChatKnobs,
  includeBody: Record<string, unknown> | null,
  excludeBody: readonly string[] | null,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    model: req.model,
    messages: buildMessages(req),
    stream: true,
    ...buildOpenAiSamplingFields(samplingFromResolved(resolved)),
    ...reasoningFields(resolved.reasoning),
    ...(req.tools !== undefined ? { tools: rawWireTools(req.tools) } : {}),
    ...(req.toolChoice !== undefined ? { tool_choice: rawToolChoice(req.toolChoice) } : {}),
    ...(req.responseFormat !== undefined ? { response_format: rawResponseFormat(req.responseFormat) } : {}),
  };
  const withCustom = req.customParameters === undefined ? base : deepMergeRequestBody(base, req.customParameters);
  return applyIncludeExclude(withCustom, includeBody, excludeBody);
}

function buildHeaders(apiKey: string | null, extra: Record<string, string> | null): Record<string, string> {
  return {
    "content-type": JSON_CONTENT_TYPE,
    ...(apiKey !== null && apiKey.length > 0 ? { authorization: `Bearer ${apiKey}` } : {}),
    ...(extra ?? {}),
  };
}

function errorPrefix(baseUrl: string): string {
  return `custom-byo (${baseUrl})`;
}

const REDIRECT_STATUS_MIN = 300;
const REDIRECT_STATUS_MAX = 400;

// True when a `redirect:"manual"` fetch response is a redirect the endpoint asked us to chase: a 3xx status,
// or the `opaqueredirect` sentinel (type "opaqueredirect", status 0). Never followed — see the fetch host-pin.
function isManualRedirect(res: Response): boolean {
  return res.type === "opaqueredirect" || (res.status >= REDIRECT_STATUS_MIN && res.status < REDIRECT_STATUS_MAX);
}

async function* oneChunk(chunk: ChatCompletionStreamChunk): AsyncGenerator<ChatCompletionStreamChunk> {
  await Promise.resolve(); // makes this a genuine async iterable
  yield chunk;
}

async function* reshapeSse(source: AsyncGenerator<unknown>, map: ResponseMap): AsyncGenerator<ChatCompletionStreamChunk> {
  for await (const raw of source) {
    yield reshapeChunk(raw, map);
  }
}

// markCommitted fires on the first streamed delta so a retry can never replay tokens to the UI.
async function fetchAndReduce(args: {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: Record<string, unknown>;
  readonly req: ChatCompletionsRequest;
  readonly baseUrl: string;
  readonly responseMap: CustomOpenAiResponseMap | null;
  readonly markCommitted: () => void;
}): Promise<{
  readonly view: Awaited<ReturnType<typeof reduceChatCompletionStream>>;
  readonly reasoning: string;
}> {
  const { url, headers, body, req, baseUrl, responseMap, markCommitted } = args;
  const chatId = castId<ChatId>(req.chatId ?? "");
  const idle = turnAbortSignal(req.signal);
  let reasoning = "";
  const reduceOpts: StreamReduceOptions = {
    onChunk: idle.reset,
    onDelta: (delta): void => {
      markCommitted();
      if (delta.kind === "reasoning") {
        reasoning += delta.text;
      }
      req.onDelta?.({ chatId, kind: delta.kind, text: delta.text });
    },
  };
  try {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        // Host-pin (#25, mirrors inspect.ts #21): NEVER chase a redirect off the configured endpoint with the
        // user's credentials in tow. Node's default `redirect:"follow"` re-sends the `Authorization: Bearer
        // <key>` header (+ any key-in-body auth) to whatever host a `302 → https://attacker/…` names — a
        // credential-exfil past the egress firewall (which blocks PRIVATE targets, not a public attacker host,
        // and does not strip credential headers on a cross-origin hop). The BYO endpoint is legitimately
        // LAN/http/IP-literal so `safeFetch` can't be used; we pin at the redirect boundary instead.
        redirect: "manual",
        signal: idle.signal,
      });
    } catch (err) {
      throw providerErrorFromHttp(err, errorPrefix(baseUrl));
    }
    // A redirect is the endpoint asking us to re-send elsewhere — surface it as a hard, NON-retryable error
    // (never a follow, never a retry that would re-send the credentials). `redirect:"manual"` guarantees fetch
    // did not follow it.
    if (isManualRedirect(res)) {
      throw new ProviderError({
        kind: "invalid",
        retryable: false,
        message: `${errorPrefix(baseUrl)}: endpoint returned a redirect (status ${res.status}); refusing to forward credentials to another host`,
      });
    }
    if (!res.ok || res.body === null) {
      const text = await res.text().catch((): string => "");
      throw providerErrorFromHttp(
        Object.assign(new Error(text.length > 0 ? text : res.statusText), {
          statusCode: res.status,
        }),
        errorPrefix(baseUrl),
      );
    }
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    // Default to SSE; only an explicit non-stream JSON content-type diverts to the single-body path.
    const nonStreamJson = contentType.includes(JSON_CONTENT_TYPE) && !contentType.includes("event-stream");
    let view: Awaited<ReturnType<typeof reduceChatCompletionStream>>;
    try {
      if (nonStreamJson) {
        const json: unknown = await res.json().catch((): null => null);
        view = await reduceChatCompletionStream(oneChunk(reshapeChunk(json, withResponseMap(BODY_DEFAULT_MAP, responseMap))), reduceOpts);
      } else {
        view = await reduceChatCompletionStream(reshapeSse(parseOpenAiSse(res.body), withResponseMap(STREAM_DEFAULT_MAP, responseMap)), reduceOpts);
      }
    } catch (err) {
      if (err instanceof ProviderError) {
        throw err;
      }
      throw providerErrorFromHttp(err, errorPrefix(baseUrl));
    }
    return { view, reasoning };
  } finally {
    idle.dispose();
  }
}

type CustomOpenAiCredential = Extract<ResolvedCredential, { readonly source: "custom_openai" }>;

// Redact the known credential literals (the apiKey + any secret-valued header) out of a captured wire body
// by VALUE. `includeBody` is user-controlled and can embed key-in-body auth, so a raw capture would sink a
// secret into the debug ring. Scrub the serialized form, then re-parse to keep a valid object (the `body`
// contract). A body with no secrets present round-trips unchanged; the `Bearer …`/`sk-…` defense-in-depth in
// `redactSecretsFromText` also catches a reshaped token. (The credential-leak-by-value class, per the
// image-proxy / response-echo precedents.)
function scrubCapturedBody(body: Record<string, unknown>, cred: CustomOpenAiCredential): Record<string, unknown> {
  const secrets = [...(cred.apiKey !== null ? [cred.apiKey] : []), ...secretHeaderValues(cred.headers)];
  if (secrets.length === 0) {
    return body;
  }
  return JSON.parse(redactSecretsFromText(JSON.stringify(body), secrets)) as Record<string, unknown>;
}

export async function runChatTurn(req: ChatRequest, deps: CustomByoRunnerDeps): Promise<ChatResult> {
  if (req.api !== "chat-completions") {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `custom-byo backend received api="${req.api}"; it serves only chat-completions`,
    });
  }
  const cred: ResolvedCredential = req.credential;
  if (cred.source !== "custom_openai") {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `custom-byo backend requires a custom_openai credential (got source="${cred.source}")`,
    });
  }

  const startedAt = deps.now();
  // ONE funnel pass per turn (the hosted-runner contract): the resolved knobs shape the body AND supply the
  // turn's degrade warnings.
  const resolved = resolveChat(req.params, req.capability);
  const body = buildBody(req, resolved, cred.includeBody, cred.excludeBody);
  // `includeBody` can carry key-in-body auth (nonstandard endpoints), so a secret could land in the debug
  // ring by VALUE. Scrub the known credential literals (the apiKey + any secret-valued header) out of the
  // captured body before recording — same seam the "Test endpoint" inspector uses on echoed responses.
  deps.captureWire?.({ chatId: req.chatId, api: req.api, backend: "custom-openai", model: req.model, body: scrubCapturedBody(body, cred) });
  const headers = buildHeaders(cred.apiKey, cred.headers);
  const url = `${cred.baseUrl.replace(TRAILING_SLASH_RE, "")}${CHAT_COMPLETIONS_PATH}`;

  const { view, reasoning } = await runWithPreCommitRetry(
    (markCommitted) =>
      fetchAndReduce({
        url,
        headers,
        body,
        req,
        baseUrl: cred.baseUrl,
        responseMap: cred.responseMap,
        markCommitted,
      }),
    (err): ProviderError => (err instanceof ProviderError ? err : providerErrorFromHttp(err, errorPrefix(cred.baseUrl))),
    {
      ...(req.signal !== undefined ? { signal: req.signal } : {}),
      now: deps.now,
      ...(deps.random !== undefined ? { random: deps.random } : {}),
    },
  );

  const turn = mapChatCompletionToTurnResult(view, {
    model: req.model,
    startedAt,
    now: deps.now(),
    contextWindow: req.capability.context.window,
    maxOutputTokens: req.capability.output.maxTokens.max,
    reasoning,
  });
  const warnings = warningEvents(turnWarnings(resolved, req.history), deps.now());
  for (const event of warnings) {
    req.onEvent?.(event);
  }
  return warnings.length > 0 ? { ...turn, events: [...turn.events, ...warnings] } : turn;
}
