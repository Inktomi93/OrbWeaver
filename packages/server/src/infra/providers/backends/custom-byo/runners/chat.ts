// infra/providers/backends/custom-byo/runners/chat — ONE chat turn against a USER-WIRED, OpenAI-
// compatible endpoint. The sealed `custom-byo` strategy: a dumb raw-fetch proxy whose ENTIRE behaviour is
// the user's config, so it talks to LM Studio / Ollama / vLLM / Groq / DeepSeek / any compatible server
// with zero per-vendor code. It imports the shared `backends/kit` wire helpers DOWN (the strategy-isolation
// seam) and NEVER reaches into a sibling backend.
//
// THE §1a FIX (providers.md "the half-built regret"): neo half-built this — request transforms were
// configurable but the MODEL PROFILE was hardcoded (128k / sonnet / no-thinking) and the RESPONSE shape was
// ASSUMED standard-OpenAI. Here NOTHING is baked:
//   • model profile → read from `req.capability` (connection produced it, user-declared for custom-byo):
//     the result's `contextWindow`/`maxOutputTokens` come from the descriptor, never a constant.
//   • response shape → reshaped through `reshapeChunk` (the response-side mirror of `applyIncludeExclude`):
//     a declared dot-path map turns a possibly-non-standard reply into the OpenAI chunk the kit reducer
//     consumes. The standard-OpenAI paths are the conservative DEFAULT; a user's override is a per-field
//     merge over them.
//
// DETERMINISM (spine/testing §3): the clock is the injected `deps.now` — no `Date.now()`/`new Date()` here;
// the pre-commit retry's jitter RNG is injectable too (tests pass a seeded one).

import type { ChatContentPart } from "@orb/contracts/chat";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { UserIntent } from "@orb/contracts/preset";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { deepMergeRequestBody } from "@orb/server/kit/custom-parameters";
import type { ChatHistoryMessage, ChatRequest, ChatResult } from "../../../contract";
import { ProviderError } from "../../../contract";
import type {
  ChatCompletionStreamChunk,
  OpenAiSamplingInput,
  StreamReduceOptions,
} from "../../kit";
import {
  buildOpenAiSamplingFields,
  chatHistoryText,
  mapChatCompletionToTurnResult,
  parseOpenAiSse,
  providerErrorFromHttp,
  rawResponseFormat,
  rawToolCallDeltas,
  rawToolChoice,
  rawWireTools,
  reduceChatCompletionStream,
  runWithPreCommitRetry,
  turnAbortSignal,
} from "../../kit";

/** The clock + jitter seams the composition root injects (no ambient `Date.now`/`Math.random`). `random`
 *  is optional — omitted in production (the retry kit defaults to `Math.random` for backoff jitter), passed
 *  by tests for determinism. File-local: a backend may not EXPORT a type (the `no-inline-types` gate). */
export interface CustomByoRunnerDeps {
  readonly now: () => number;
  readonly random?: (() => number) | undefined;
}

// Only the `chat-completions` arm reaches this backend (a user-wired OpenAI server speaks chat-completions;
// the `responses`/`agent-sdk` arms route elsewhere). File-local narrow — not an exported boundary type.
type ChatCompletionsRequest = Extract<ChatRequest, { readonly api: "chat-completions" }>;

const CHAT_COMPLETIONS_PATH = "/chat/completions";
const JSON_CONTENT_TYPE = "application/json";
const SYSTEM_ROLE = "system";
const TRAILING_SLASH_RE = /\/$/u;

// ── The response map (the user-declared response transform — §1a) ──────────────────────────────────
// The response-side counterpart to the request-side include/exclude: the user describes a reply shape by
// DATA (dot-paths), and `reshapeChunk` reads those paths out of each streamed chunk (or the whole
// non-streamed body) to rebuild the OpenAI chunk the kit reducer consumes. The map type is file-local
// (the `no-inline-types` gate forbids a backend exporting a type).
//
// A dot-path addresses one JSON value; a numeric segment indexes an array — e.g. `choices.0.delta.content`
// (a server nesting one level deeper than OpenAI) or `output.text` (a flat custom shape).
interface ResponseMap {
  /** Dot-path to the reply text in ONE streamed chunk OR the whole non-streamed body. */
  readonly contentPath: string;
  /** Dot-path to CoT/reasoning text, when the endpoint emits it on a separate field. */
  readonly reasoningPath?: string | undefined;
  /** Dot-path to the finish-reason string (terminal chunk / body). */
  readonly finishReasonPath?: string | undefined;
  /** Dot-path to the prompt-token count (provenance only). */
  readonly promptTokensPath?: string | undefined;
  /** Dot-path to the completion-token count (provenance only). */
  readonly completionTokensPath?: string | undefined;
  /** Dot-path to an in-band error message — promoted to a thrown (classified) error. */
  readonly errorMessagePath?: string | undefined;
  /** Dot-path to an in-band error code (HTTP-status-shaped, drives classification). */
  readonly errorCodePath?: string | undefined;
  /** Dot-path to the raw `tool_calls` array (stream fragments OR one-shot complete calls — D48/T2). */
  readonly toolCallsPath?: string | undefined;
}

// The conservative DEFAULTS (the wire is raw snake_case — the OpenRouter SDK's camelCase normalisation does
// NOT apply to a raw fetch). STREAM addresses one SSE chunk's `delta`; BODY addresses a non-streamed body's
// `message`. A future user override (deferred — the PD-13 response-map metadata) is a per-field merge
// over these; nothing consumes an override map today.
const STREAM_DEFAULT_MAP: ResponseMap = {
  contentPath: "choices.0.delta.content",
  reasoningPath: "choices.0.delta.reasoning",
  finishReasonPath: "choices.0.finish_reason",
  promptTokensPath: "usage.prompt_tokens",
  completionTokensPath: "usage.completion_tokens",
  errorMessagePath: "error.message",
  errorCodePath: "error.code",
  // D48/T2: standard-OpenAI only in v1 (fragments are arrays — the dot-path map can't express them; a
  // user override lands with the PD-13 response-map metadata if ever needed).
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
  // One-shot bodies carry COMPLETE calls; `rawToolCallDeltas` maps them to position-indexed fragments.
  toolCallsPath: "choices.0.message.tool_calls",
};

// File-local: narrow an unknown to an indexable object (covers arrays — `typeof [] === "object"`, and a
// numeric path segment indexes them by string key). Avoids an `as` cast (biome-banned).
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

/** Read a dot-path out of an arbitrary JSON value. Numeric segments index arrays; any missing or
 *  non-traversable segment yields `undefined` (never throws). */
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

/**
 * Reshape ONE raw provider JSON object — a streamed SSE payload OR a whole non-streamed body — into the
 * OpenAI {@link ChatCompletionStreamChunk} the kit reducer consumes, by reading the map's dot-paths. An
 * in-band error (message path present) is carried through so the reducer can promote it to a classified
 * throw rather than silently yielding an empty reply. Pure + exported so the family's tests can drive it
 * with a NON-standard body + a custom map directly (the §1a reshaping contract).
 */
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
  const error =
    errorMessage !== undefined
      ? { message: errorMessage, code: readNumber(raw, map.errorCodePath) ?? 0 }
      : undefined;
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

// Project the provider-agnostic UserIntent sampler knobs into the kit's OpenAI sampling input (camelCase →
// the kit emits the snake_case wire). Capability-GATING (dropping a knob the model doesn't honour) is
// `resolve-chat`'s job upstream; this projects what the user set and lets the endpoint ignore the rest.
function samplingFromIntent(params: UserIntent): OpenAiSamplingInput {
  return {
    temperature: params.temperature,
    topP: params.topP,
    topK: params.topK,
    frequencyPenalty: params.frequencyPenalty,
    presencePenalty: params.presencePenalty,
    repetitionPenalty: params.repetitionPenalty,
    seed: params.seed,
    logitBias: params.logitBias,
    stop: params.stop,
    maxTokens: params.maxOutputTokens,
  };
}

// The raw-wire tool halves of one turn (D48/T2 — snake field names, biome-exempted at the sites).
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

function rawToolResultMessages(content: readonly ChatContentPart[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const part of content) {
    if (part.type === "tool-result") {
      // biome-ignore lint/style/useNamingConvention: OpenAI-compatible wire field name (snake_case).
      out.push({ role: "tool", tool_call_id: part.toolCallId, content: part.content });
    }
  }
  return out;
}

// One user/assistant turn → its raw message, or null when empty (a text-less assistant tool-call turn is
// KEPT — the calls ARE its content).
function rawTurnMessage(turn: ChatHistoryMessage): Record<string, unknown> | null {
  const text = chatHistoryText(turn.content);
  const toolCalls = turn.role === "assistant" ? rawHistoryToolCalls(turn.content) : [];
  if (text.trim().length === 0 && toolCalls.length === 0) {
    return null;
  }
  return {
    role: turn.role,
    content: text,
    // biome-ignore lint/style/useNamingConvention: OpenAI-compatible wire field name (snake_case).
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    ...(turn.name !== undefined ? { name: turn.name } : {}),
  };
}

// Assemble the OpenAI-spec messages: the split system prompt folded into one `system` turn (cache-stable
// prefix + volatile tail), then the non-empty history turns carrying their per-participant `name`. A
// materialized tool exchange (D48/T2) maps per the raw wire: assistant `tool-call` parts → `tool_calls`;
// a `tool`-role turn → one `{role:"tool"}` message per `tool-result` part.
function buildMessages(req: ChatCompletionsRequest): readonly Record<string, unknown>[] {
  const systemText = [req.systemPrompt.static.trim(), req.systemPrompt.dynamic.trim()]
    .filter((part) => part.length > 0)
    .join("\n\n");
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

// Build the request body: the OpenAI base (model/messages/stream/sampling), then the preset's
// `customParameters` DEEP-merged in (user wins — the one request-body overlay decided + present today).
//
// FLAG[PD-13]: the per-endpoint `includeBody`/`excludeBody` transforms (§1a request mappings) have NO
// contract home yet (v1 deferral: the credential metadata carries only baseUrl/model/headers). When they
// land on the credential/metadata they apply here as the second `applyIncludeExclude` layer, downstream of
// the customParameters merge below.
function buildBody(req: ChatCompletionsRequest): Record<string, unknown> {
  const base: Record<string, unknown> = {
    model: req.model,
    messages: buildMessages(req),
    stream: true,
    ...buildOpenAiSamplingFields(samplingFromIntent(req.params)),
    // D48/T2: absent means ABSENT — a tool-less/format-less body stays byte-identical to pre-D48; the
    // `auto` toolChoice default is the CALLER's, never hardwired here.
    ...(req.tools !== undefined ? { tools: rawWireTools(req.tools) } : {}),
    // biome-ignore lint/style/useNamingConvention: OpenAI-compatible wire field names (snake_case).
    ...(req.toolChoice !== undefined ? { tool_choice: rawToolChoice(req.toolChoice) } : {}),
    // biome-ignore lint/style/useNamingConvention: OpenAI-compatible wire field names (snake_case).
    ...(req.responseFormat !== undefined
      ? { response_format: rawResponseFormat(req.responseFormat) }
      : {}),
  };
  // Layer 2 (PD-101): `req.customParameters` is `patch` — user wins at any leaf, incl. nested objects
  // (e.g. a deep `reasoning: {...}` override), and `__proto__`/`constructor`/`prototype` are no-ops
  // regardless of which side carries them. The kit's `applyIncludeExclude` (`backends/kit/openai-compat/
  // body.ts` — exported+tested there, NOT imported here) becomes the second layer once the FLAG[PD-13]
  // per-endpoint include/exclude transforms land on the credential metadata — it is NOT the
  // customParameters overlay path, so it is not called here today.
  return req.customParameters === undefined
    ? base
    : deepMergeRequestBody(base, req.customParameters);
}

// The request headers: JSON content-type, optional bearer auth, then the user's per-endpoint header
// transform LAST (a BYO user may deliberately override content-type/auth — the user controls the wire).
function buildHeaders(
  apiKey: string | null,
  extra: Record<string, string> | null,
): Record<string, string> {
  return {
    "content-type": JSON_CONTENT_TYPE,
    ...(apiKey !== null && apiKey.length > 0 ? { authorization: `Bearer ${apiKey}` } : {}),
    ...(extra ?? {}),
  };
}

// Operator-facing, secret-free error label (baseUrl is the endpoint selection, not key material).
function errorPrefix(baseUrl: string): string {
  return `custom-byo (${baseUrl})`;
}

// Wrap a single already-shaped chunk (the non-streamed body path) as a one-element stream so the kit
// reducer/mapper apply uniformly across both paths.
async function* oneChunk(
  chunk: ChatCompletionStreamChunk,
): AsyncGenerator<ChatCompletionStreamChunk> {
  await Promise.resolve(); // makes this a genuine async iterable (the reducer awaits the stream)
  yield chunk;
}

// Reshape each raw SSE payload (yielded as `unknown` by the kit parser) into the chunk the reducer reads.
async function* reshapeSse(
  source: AsyncGenerator<unknown>,
  map: ResponseMap,
): AsyncGenerator<ChatCompletionStreamChunk> {
  for await (const raw of source) {
    yield reshapeChunk(raw, map);
  }
}

// What `runWithPreCommitRetry` retries: one full POST + drain. A fresh idle-abort signal is built per
// attempt (a retry needs its own); `markCommitted` fires on the first streamed delta so a retry can never
// replay tokens to the UI. Every failure path throws a `ProviderError` so the retry re-throw is typed.
async function fetchAndReduce(args: {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: Record<string, unknown>;
  readonly req: ChatCompletionsRequest;
  readonly baseUrl: string;
  readonly markCommitted: () => void;
}): Promise<{
  readonly view: Awaited<ReturnType<typeof reduceChatCompletionStream>>;
  readonly reasoning: string;
}> {
  const { url, headers, body, req, baseUrl, markCommitted } = args;
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
        signal: idle.signal,
      });
    } catch (err) {
      throw providerErrorFromHttp(err, errorPrefix(baseUrl));
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
    // Default to SSE (a streaming endpoint, or one that omits content-type). Only an explicit non-stream
    // JSON content-type diverts to the single-body path (an endpoint that ignored `stream:true`).
    const nonStreamJson =
      contentType.includes(JSON_CONTENT_TYPE) && !contentType.includes("event-stream");
    let view: Awaited<ReturnType<typeof reduceChatCompletionStream>>;
    try {
      if (nonStreamJson) {
        const json: unknown = await res.json().catch((): null => null);
        view = await reduceChatCompletionStream(
          oneChunk(reshapeChunk(json, BODY_DEFAULT_MAP)),
          reduceOpts,
        );
      } else {
        view = await reduceChatCompletionStream(
          reshapeSse(parseOpenAiSse(res.body), STREAM_DEFAULT_MAP),
          reduceOpts,
        );
      }
    } catch (err) {
      if (err instanceof ProviderError) {
        throw err;
      }
      // An in-band stream error (the reducer promotes `chunk.error` to a throw) or an abort — classify it.
      throw providerErrorFromHttp(err, errorPrefix(baseUrl));
    }
    return { view, reasoning };
  } finally {
    idle.dispose();
  }
}

/**
 * Run one chat turn against the user-wired endpoint. Fail-closed on a wrong api/source (the dispatcher
 * guarantees the pairing; a mismatch is an operator wiring error, not a silent fallback). The model
 * profile is read from `req.capability` — the §1a fix for neo's hardcoded window/tier.
 */
export async function runChatTurn(
  req: ChatRequest,
  deps: CustomByoRunnerDeps,
): Promise<ChatResult> {
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
  const body = buildBody(req);
  const headers = buildHeaders(cred.apiKey, cred.headers);
  const url = `${cred.baseUrl.replace(TRAILING_SLASH_RE, "")}${CHAT_COMPLETIONS_PATH}`;

  const { view, reasoning } = await runWithPreCommitRetry(
    (markCommitted) =>
      fetchAndReduce({ url, headers, body, req, baseUrl: cred.baseUrl, markCommitted }),
    (err): ProviderError =>
      err instanceof ProviderError ? err : providerErrorFromHttp(err, errorPrefix(cred.baseUrl)),
    {
      ...(req.signal !== undefined ? { signal: req.signal } : {}),
      now: deps.now,
      ...(deps.random !== undefined ? { random: deps.random } : {}),
    },
  );

  return mapChatCompletionToTurnResult(view, {
    model: req.model,
    startedAt,
    now: deps.now(),
    // The §1a fix — the model profile is the user-declared capability descriptor, never a baked constant.
    contextWindow: req.capability.context.window,
    maxOutputTokens: req.capability.output.maxTokens.max,
    reasoning,
  });
}
