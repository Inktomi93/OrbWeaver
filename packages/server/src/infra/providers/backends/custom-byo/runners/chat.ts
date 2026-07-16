// ONE chat turn against a user-wired, OpenAI-compatible endpoint: a dumb raw-fetch proxy whose entire
// behaviour is the user's config. Model profile reads from req.capability (never a baked constant);
// response shape reshapes through a declared dot-path map so a non-standard reply still maps cleanly.

import type { ChatContentPart } from "@orb/contracts/chat";
import type { CustomOpenAiResponseMap, ResolvedCredential } from "@orb/contracts/credentials";
import type { UserIntent } from "@orb/contracts/preset";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { deepMergeRequestBody } from "@orb/server/kit/custom-parameters";
import type { ChatHistoryMessage, ChatRequest, ChatResult } from "../../../contract";
import { ProviderError } from "../../../contract";
import type { ChatCompletionStreamChunk, OpenAiSamplingInput, StreamReduceOptions } from "../../kit";
import {
  applyIncludeExclude,
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

export interface CustomByoRunnerDeps {
  readonly now: () => number;
  readonly random?: (() => number) | undefined;
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

function samplingFromIntent(params: UserIntent): OpenAiSamplingInput {
  return {
    temperature: params.temperature,
    topP: params.topP,
    topK: params.topK,
    frequencyPenalty: params.frequencyPenalty,
    presencePenalty: params.presencePenalty,
    repetitionPenalty: params.repetitionPenalty,
    minP: params.minP,
    seed: params.seed,
    logitBias: params.logitBias,
    stop: params.stop,
    maxTokens: params.maxOutputTokens,
  };
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

// The user's per-endpoint request transforms (PD-13) apply LAST — AFTER the preset's `customParameters`
// deep-merge — so `includeBody`/`excludeBody` are the endpoint's final word (a field the server rejects is
// stripped even if a preset re-added it).
function buildBody(req: ChatCompletionsRequest, includeBody: Record<string, unknown> | null, excludeBody: readonly string[] | null): Record<string, unknown> {
  const base: Record<string, unknown> = {
    model: req.model,
    messages: buildMessages(req),
    stream: true,
    ...buildOpenAiSamplingFields(samplingFromIntent(req.params)),
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
  const body = buildBody(req, cred.includeBody, cred.excludeBody);
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

  return mapChatCompletionToTurnResult(view, {
    model: req.model,
    startedAt,
    now: deps.now(),
    contextWindow: req.capability.context.window,
    maxOutputTokens: req.capability.output.maxTokens.max,
    reasoning,
  });
}
