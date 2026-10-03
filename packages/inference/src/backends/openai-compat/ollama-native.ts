// Ollama's native chat route under the openai-compat backend (D296): the SDK still builds an OpenAI chat body
// and parses OpenAI chunks, and this file translates both ends. `/v1/chat/completions` drops `num_ctx` and
// the samplers Ollama's Go decoder has no field for, so a row whose folded `features.nativeChat` is `ollama`
// sends `/api/chat` instead. The request is translated in `wrapFetch`'s `shapeBody`, so the wire capture holds
// the native body; the response is translated in the fetch underneath it, so the SDK and the reshaping read
// OpenAI chunks.

import { ProviderError } from "../../contract/errors.ts";
import { serverRootOf } from "../kit/fetch-json.ts";
import { encodeSseData, SSE_DONE_LINE } from "../kit/sse.ts";

const CHAT_COMPLETIONS_SUFFIX = "/chat/completions";
const NATIVE_CHAT_PATH = "/api/chat";
const EVENT_STREAM = "text/event-stream";
const JSON_CONTENT_TYPE = "application/json";
const CONTENT_TYPE = "content-type";
const DATA_URL_RE = /^data:[^;,]+;base64,(?<data>.*)$/su;
/** Text parts of one message join with a blank line, as the same-role fold separates rows. */
const PART_SEPARATOR = "\n\n";
const ERROR_BODY_LIMIT = 65_536;
const REASONING_OFF = "none";
export const THINK_KEY = "think";

/** The output cap's OpenAI spellings, which `/api/chat` reads as `options.num_predict`. The samplers move into
 *  `options` under the keys the sampler seam already spelled for this row (`samplerBodyKeys`). */
const OUTPUT_CAP_KEYS: ReadonlySet<string> = new Set(["max_tokens", "max_completion_tokens"]);
const NUM_PREDICT = "num_predict";
/** OpenAI-only keys `/api/chat` has no field for; translated above or below, or meaningless here. */
const DROPPED_KEYS: ReadonlySet<string> = new Set([
  "messages",
  "tool_choice",
  "parallel_tool_calls",
  "stream_options",
  "response_format",
  "reasoning_effort",
  "n",
  "user",
  "logit_bias",
]);

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// ── the request ─────────────────────────────────────────────────────────────────────────────────────────

function imageData(part: Json, label: string): string {
  const url = isRecord(part["image_url"]) ? part["image_url"]["url"] : undefined;
  const match = typeof url === "string" ? DATA_URL_RE.exec(url) : null;
  if (match?.groups?.["data"] === undefined) {
    // `/api/chat` takes base64 image bytes only; it never fetches a URL.
    throw new ProviderError({ kind: "invalid", retryable: false, message: `${label}: Ollama's chat route takes inline images only, and this one is a URL` });
  }
  return match.groups["data"];
}

/** One message's content as Ollama's string plus its `images`. */
function contentOf(content: unknown, label: string): { readonly text: string; readonly images: readonly string[] } {
  if (typeof content === "string" || content === null || content === undefined) {
    return { text: content ?? "", images: [] };
  }
  const parts = Array.isArray(content) ? content.filter(isRecord) : [];
  const text = parts.flatMap((part) => (part["type"] === "text" && typeof part["text"] === "string" ? [part["text"]] : [])).join(PART_SEPARATOR);
  const images = parts.filter((part) => part["type"] === "image_url").map((part) => imageData(part, label));
  return { text, images };
}

function notJson(kind: "invalid" | "server", message: string, cause: unknown): ProviderError {
  return new ProviderError({ kind, retryable: kind === "server", message, cause });
}

function parsedArguments(raw: unknown): unknown {
  if (typeof raw !== "string") {
    return raw ?? {};
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch (cause) {
    throw notJson("invalid", "a replayed tool call carries arguments that are not JSON", cause);
  }
}

function nativeToolCalls(calls: unknown): Json[] | undefined {
  if (!Array.isArray(calls) || calls.length === 0) {
    return;
  }
  return calls.filter(isRecord).map((call) => {
    const fn = isRecord(call["function"]) ? call["function"] : {};
    return { ...(typeof call["id"] === "string" ? { id: call["id"] } : {}), function: { name: fn["name"], arguments: parsedArguments(fn["arguments"]) } };
  });
}

/** Remember each call id's tool name, so the tool row that answers it can be named. */
function rememberToolNames(calls: unknown, toolNames: Map<string, string>): void {
  for (const call of Array.isArray(calls) ? calls.filter(isRecord) : []) {
    const name = isRecord(call["function"]) ? call["function"]["name"] : undefined;
    if (typeof call["id"] === "string" && typeof name === "string") {
      toolNames.set(call["id"], name);
    }
  }
}

function nativeMessage(row: Json, toolNames: ReadonlyMap<string, string>, label: string): Json {
  const { text, images } = contentOf(row["content"], label);
  const toolCalls = nativeToolCalls(row["tool_calls"]);
  const answered = typeof row["tool_call_id"] === "string" ? toolNames.get(row["tool_call_id"]) : undefined;
  const thinking = row["reasoning_content"] ?? row["reasoning"];
  return {
    role: row["role"],
    content: text,
    ...(images.length > 0 ? { images: [...images] } : {}),
    ...(toolCalls !== undefined ? { ["tool_calls"]: toolCalls } : {}),
    ...(typeof thinking === "string" && thinking !== "" ? { thinking } : {}),
    ...(answered !== undefined ? { ["tool_name"]: answered } : {}),
  };
}

/** OpenAI messages to Ollama's: string content, base64 `images`, object tool arguments, replayed thinking as
 *  `thinking`, and a tool result named by the call it answers (`tool_name`). */
function nativeMessages(messages: unknown, label: string): Json[] {
  const rows = Array.isArray(messages) ? messages.filter(isRecord) : [];
  const toolNames = new Map<string, string>();
  return rows.map((row) => {
    rememberToolNames(row["tool_calls"], toolNames);
    return nativeMessage(row, toolNames, label);
  });
}

/** `response_format` as Ollama's `format`: `json` for a JSON object, the schema itself for a JSON schema. */
function formatOf(responseFormat: unknown): unknown {
  if (!isRecord(responseFormat)) {
    return;
  }
  if (responseFormat["type"] === "json_object") {
    return "json";
  }
  return responseFormat["type"] === "json_schema" && isRecord(responseFormat["json_schema"]) ? responseFormat["json_schema"]["schema"] : undefined;
}

/** `reasoning_effort` as Ollama's `think`: off for `none`. A model whose capability names effort levels (gpt-oss:
 *  low/medium/high) takes the level itself, which Ollama's harmony renderer reads; any other model takes `true`. */
function thinkOf(effort: unknown, namedLevels: boolean): boolean | string | undefined {
  if (typeof effort !== "string") {
    return;
  }
  if (effort === REASONING_OFF) {
    return false;
  }
  return namedLevels ? effort : true;
}

// The user's own `think` (set or excluded) stands; otherwise it is translated from `reasoning_effort`.
function translatedThink(
  body: Json,
  args: { readonly namedThinkLevels?: boolean | undefined; readonly thinkExcluded?: boolean | undefined },
): boolean | string | undefined {
  return THINK_KEY in body || args.thinkExcluded === true ? undefined : thinkOf(body["reasoning_effort"], args.namedThinkLevels === true);
}

/**
 * The OpenAI chat body the SDK built (after `extras` and `includeBody`) as an `/api/chat` body. `numCtx` is the
 * resolved window, sent as `options.num_ctx` so the server runs the window the capability states.
 * `samplerKeys` are the body keys the sampler seam spells for this row; each moves into `options` as is.
 * `keepAlive` and `numBatch` are the connection's own (`features.keepAlive`, `features.numBatch`). Keys
 * this file does not know pass through unchanged, so a native field set in `includeBody` reaches the server,
 * and an `options` object set there wins over the translated one key by key. A `think` already in the body is
 * the user's own (extras or `includeBody`) and stands over the one translated from `reasoning_effort`; one the
 * user excluded (`thinkExcluded`) stays absent.
 */
export function toOllamaChat(
  body: Json,
  args: {
    readonly numCtx: number | undefined;
    readonly samplerKeys: ReadonlySet<string>;
    readonly label: string;
    readonly namedThinkLevels?: boolean | undefined;
    readonly thinkExcluded?: boolean | undefined;
    readonly keepAlive?: string | undefined;
    readonly numBatch?: number | undefined;
  },
): Json {
  const options: Json = {};
  const rest: Json = {};
  for (const [key, value] of Object.entries(body)) {
    if (args.samplerKeys.has(key)) {
      options[key] = value;
    } else if (OUTPUT_CAP_KEYS.has(key)) {
      options[NUM_PREDICT] = value;
    } else if (!DROPPED_KEYS.has(key) && key !== "options") {
      rest[key] = value;
    }
  }
  const format = formatOf(body["response_format"]);
  const think = translatedThink(body, args);
  return {
    ...rest,
    // `/api/chat` streams unless told otherwise, and the SDK's non-streaming generate sends no `stream` key.
    stream: body["stream"] === true,
    messages: nativeMessages(body["messages"], args.label),
    ...(format !== undefined ? { format } : {}),
    ...(think !== undefined ? { [THINK_KEY]: think } : {}),
    ...(args.keepAlive !== undefined ? { ["keep_alive"]: args.keepAlive } : {}),
    options: {
      ...options,
      ...(args.numCtx !== undefined ? { ["num_ctx"]: args.numCtx } : {}),
      ...(args.numBatch !== undefined ? { ["num_batch"]: args.numBatch } : {}),
      ...(isRecord(body["options"]) ? body["options"] : {}),
    },
  };
}

// ── the response ────────────────────────────────────────────────────────────────────────────────────────

/** Per-stream state: tool calls get a running index and an id, and a turn that called a tool finishes as one. */
interface StreamState {
  toolCalls: number;
}

function usageOf(line: Json): Json | undefined {
  if (line["done"] !== true) {
    return;
  }
  const prompt = typeof line["prompt_eval_count"] === "number" ? line["prompt_eval_count"] : 0;
  const completion = typeof line["eval_count"] === "number" ? line["eval_count"] : 0;
  const cached = line["prompt_eval_cached_count"];
  return {
    ["prompt_tokens"]: prompt,
    ["completion_tokens"]: completion,
    ["total_tokens"]: prompt + completion,
    ...(typeof cached === "number" ? { ["prompt_tokens_details"]: { ["cached_tokens"]: cached } } : {}),
  };
}

function openAiToolCalls(calls: unknown, state: StreamState): Json[] | undefined {
  if (!Array.isArray(calls) || calls.length === 0) {
    return;
  }
  return calls.filter(isRecord).map((call) => {
    const fn = isRecord(call["function"]) ? call["function"] : {};
    const index = state.toolCalls;
    state.toolCalls += 1;
    const args = fn["arguments"];
    return {
      index,
      id: typeof call["id"] === "string" ? call["id"] : `call_${index}`,
      type: "function",
      function: { name: fn["name"], arguments: typeof args === "string" ? args : JSON.stringify(args ?? {}) },
    };
  });
}

function finishReasonOf(line: Json, state: StreamState): string | null {
  if (line["done"] !== true) {
    return null;
  }
  if (state.toolCalls > 0) {
    return "tool_calls";
  }
  return line["done_reason"] === "length" ? "length" : "stop";
}

/** The OpenAI `delta`/`message` slot of one native message. */
function slotOf(message: unknown, state: StreamState): Json {
  const msg = isRecord(message) ? message : {};
  const toolCalls = openAiToolCalls(msg["tool_calls"], state);
  return {
    role: "assistant",
    content: typeof msg["content"] === "string" ? msg["content"] : "",
    ...(typeof msg["thinking"] === "string" && msg["thinking"] !== "" ? { ["reasoning_content"]: msg["thinking"] } : {}),
    ...(toolCalls !== undefined ? { ["tool_calls"]: toolCalls } : {}),
  };
}

function errorOf(line: Json): Json | undefined {
  return typeof line["error"] === "string" ? { error: { message: line["error"] } } : undefined;
}

function chunkOf(line: Json, state: StreamState): Json {
  const error = errorOf(line);
  if (error !== undefined) {
    return error;
  }
  const usage = usageOf(line);
  return {
    object: "chat.completion.chunk",
    model: line["model"],
    choices: [{ index: 0, delta: slotOf(line["message"], state), ["finish_reason"]: finishReasonOf(line, state) }],
    ...(usage !== undefined ? { usage } : {}),
  };
}

function completionOf(line: Json): Json {
  const error = errorOf(line);
  if (error !== undefined) {
    return error;
  }
  const state: StreamState = { toolCalls: 0 };
  const message = slotOf(line["message"], state);
  return {
    object: "chat.completion",
    model: line["model"],
    choices: [{ index: 0, message, ["finish_reason"]: finishReasonOf({ ...line, done: true }, state) }],
    usage: usageOf({ ...line, done: true }),
  };
}

function parseLine(text: string, label: string): Json {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw notJson("server", `${label}: Ollama sent a line that is not JSON`, cause);
  }
  if (!isRecord(parsed)) {
    throw new ProviderError({ kind: "server", retryable: true, message: `${label}: Ollama sent a line that is not a JSON object` });
  }
  return parsed;
}

/** Ollama's NDJSON stream as OpenAI SSE: one `data:` chunk per line, then `[DONE]`. Cancelling the SSE side
 *  cancels the server's stream, so an abort reaches the socket. */
function sseFromNdjson(body: ReadableStream<Uint8Array>, label: string): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const state: StreamState = { toolCalls: 0 };
  let buffer = "";
  const emit = (controller: ReadableStreamDefaultController<Uint8Array>, line: string): void => {
    if (line.trim() !== "") {
      controller.enqueue(encoder.encode(encodeSseData(chunkOf(parseLine(line, label), state))));
    }
  };
  return new ReadableStream<Uint8Array>({
    // A pull that enqueues nothing is never retried, so keep reading until a line lands or the body ends.
    async pull(controller): Promise<void> {
      for (;;) {
        const next = await reader.read();
        if (next.done) {
          emit(controller, buffer + decoder.decode());
          controller.enqueue(encoder.encode(SSE_DONE_LINE));
          controller.close();
          return;
        }
        buffer += decoder.decode(next.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          emit(controller, line);
        }
        if (lines.some((line) => line.trim() !== "")) {
          return;
        }
      }
    },
    async cancel(reason): Promise<void> {
      await reader.cancel(reason);
    },
  });
}

/** An error body read to a bound, so a server that streams an endless error cannot hold the turn. */
async function cappedText(res: Response): Promise<string> {
  if (res.body === null) {
    return "";
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const next = await reader.read();
    if (next.done) {
      return out + decoder.decode();
    }
    out += decoder.decode(next.value, { stream: true });
    if (out.length >= ERROR_BODY_LIMIT) {
      await reader.cancel();
      return out.slice(0, ERROR_BODY_LIMIT);
    }
  }
}

function headersWith(res: Response, contentType: string): Headers {
  const headers = new Headers(res.headers);
  headers.set(CONTENT_TYPE, contentType);
  headers.delete("content-length");
  return headers;
}

/** An Ollama error body (`{"error":"…"}`) in the OpenAI error shape the SDK's error handler reads. */
async function failedResponse(res: Response): Promise<Response> {
  const text = await cappedText(res);
  let message = text;
  try {
    const parsed: unknown = JSON.parse(text);
    message = isRecord(parsed) && typeof parsed["error"] === "string" ? parsed["error"] : text;
    // @orb-waive caught-failure-ownership(catch): a non-JSON error body is still the server's message; it is
    // handed on as the error text, and the SDK raises it. Ends if a body here could be anything but an error.
  } catch {
    message = text;
  }
  return new Response(JSON.stringify({ error: { message } }), { status: res.status, statusText: res.statusText, headers: headersWith(res, JSON_CONTENT_TYPE) });
}

async function translatedResponse(res: Response, label: string): Promise<Response> {
  if (!res.ok) {
    return await failedResponse(res);
  }
  const contentType = (res.headers.get(CONTENT_TYPE) ?? "").toLowerCase();
  if (contentType.includes(JSON_CONTENT_TYPE)) {
    const body = completionOf(parseLine(await res.text(), label));
    return new Response(JSON.stringify(body), { status: res.status, statusText: res.statusText, headers: headersWith(res, JSON_CONTENT_TYPE) });
  }
  if (res.body === null) {
    throw new ProviderError({ kind: "server", retryable: true, message: `${label}: Ollama answered with no body` });
  }
  return new Response(sseFromNdjson(res.body, label), { status: res.status, statusText: res.statusText, headers: headersWith(res, EVENT_STREAM) });
}

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.toString() : input.url;
}

/** The fetch under `wrapFetch` for a native row: the SDK's `…/v1/chat/completions` becomes `/api/chat` on the
 *  server root, and the reply comes back in OpenAI's shape. Any other path (none today) passes through. */
export function ollamaNativeFetch(inner: typeof fetch, args: { readonly baseUrl: string; readonly label: string }): typeof fetch {
  return async (input, init): Promise<Response> => {
    if (!urlOf(input).endsWith(CHAT_COMPLETIONS_SUFFIX)) {
      return await inner(input, init);
    }
    const res = await inner(`${serverRootOf(args.baseUrl)}${NATIVE_CHAT_PATH}`, init);
    return await translatedResponse(res, args.label);
  };
}
