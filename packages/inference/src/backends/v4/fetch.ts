// `wrapFetch` — the `fetch` every SDK provider instance on a HOSTED wire receives (openai-compat + anthropic-messages). FOUR of the five
// custom-byo controls that survive the SDK cut-over live here (§8.1), for EVERY endpoint row alike:
//   1. HOST-PIN (#25): `redirect: "manual"`, and ANY 3xx / opaqueredirect is a hard NON-retryable error, never
//      followed — Node's default follow re-sends `Authorization: Bearer …` to whatever host `Location` names.
//   3. Error bodies are read capped at 64 KiB with `reader.cancel()` past it, then handed to the SDK as a
//      re-framed `Response` so its own failed-response handler classifies the (scrubbed) text. The read
//      OVER-reads by `secretScrubOverhang` and scrubs before it slices (#1820) — see `scrubToLimit`.
//   4. Wire-capture bodies are SECRET-SCRUBBED BY VALUE before the ring (`transport.includeBody` can carry
//      key-in-body auth), and the entry is emitted AFTER the attempt so the RESPONSE HEADERS ride with it
//      (§D1: Anthropic's `request-id` + rate-limit budget, OpenRouter's `x-openrouter-*` routing trail).
//      Here rather than at the `doStream` result because the bytes this file holds are the FINAL ones —
//      after `transformRequestBody` AND after our own `shapeBody` — while the SDK result's `request.body`
//      is an earlier copy that predates the shaping.
//   4b. THE REPLY TAP (§D2/§D3), opt-in (`capture.reply`): the response body is TEE'd, our branch drained to
//      the SAME 64 KiB cap with the SAME `reader.cancel()` discipline as control 3 (one number, one reason),
//      and the entry emitted when that drain ends — so the request body, the response headers AND the literal
//      reply text ride ONE ring row. A HEAD cap is the right end to keep: OpenRouter puts its
//      `debug.echo_upstream_body` payload in the FIRST SSE frame.
//
//      REJECTED ALTERNATIVE, recorded so nobody re-derives it from the audit: the SDK's `includeRawChunks` +
//      the V4 `raw` stream part (the audit's own D2/D3 fix text, "the reducer forwards `raw` parts to the
//      capture sink"). MEASURED against the installed provider dist 3.0.0: `includeRawChunks` only decides
//      whether the OR provider re-emits each ALREADY-PARSED chunk as a `{type:"raw", rawValue}` part
//      (`dist/index.js:3941-3942`); it changes neither the request nor the SSE bytes. And
//      `debug.echo_upstream_body` is a REQUEST BODY field whose payload "will be returned as the first chunk
//      in the stream" (`dist/index.d.ts:174-185`) — i.e. it rides the ordinary SSE. So `includeRawChunks` is
//      what the SDK needs to SURFACE the echo as a part, NOT what our capture needs to SEE it: D2 and D3 are
//      one toggle at the SDK part layer only, and this transport sits underneath it. The raw part is also
//      strictly weaker evidence — post-parse JSON, one payload per chunk (so either a second entry shape or a
//      fully deferred emit), and reachable only from a `doStream` call site, while this tap is the literal
//      wire, at one site, for every surface (chat, embed, image, diagnostics) on both hosted wires. It rests
//      on exactly the argument control 4 already makes for the request side.
//   • `transport.responseMap` + `features.reasoningKeys`: each SSE chunk / the JSON body is reshaped through
//     the user's dot paths BEFORE the SDK parses it (today's `reshapeChunk`), so a non-OpenAI reply still
//     lands on the SDK's chunk schema. Only when a map or key list is set — the untouched stream passes
//     through by reference otherwise.
// The openrouter transport ALSO routes its body shaping through here (`shapeBody`), because the OR provider
// exposes no post-convert hook: the request body is parsed ONCE, shaped, captured, re-serialised.

import type { Wire } from "@orb/contracts/inference";
import type { ChatId } from "@orb/kit/ids";
import type { WireCaptureSink } from "../../contract/backend.ts";
import type { ProviderScrubSet } from "../../contract/errors.ts";
import { ProviderError } from "../../contract/errors.ts";
import type { ResponseMap } from "../../contract/resolved.ts";
import { redactSecretsFromText, secretScrubOverhang } from "../kit/openai-body.ts";
import { encodeSseData, parseOpenAiSse, SSE_DONE_LINE } from "../kit/sse.ts";

const ERROR_BODY_LIMIT = 65_536;
const REDIRECT_MIN = 300;
const REDIRECT_MAX = 399;
const JSON_CONTENT_TYPE = "application/json";
const EVENT_STREAM = "text/event-stream";
const CONTENT_TYPE = "content-type";
const REASONING_CONTENT_KEY = "reasoning_content";

/** The per-call context the wrapper closes over. Built PER CALL (a transport instance is cheap), so the
 *  capture and the shaping see this turn's connection, model and chat id. */
export interface WrapFetchArgs {
  readonly fetch: typeof fetch;
  readonly secrets: ProviderScrubSet;
  readonly label: string;
  readonly responseMap: ResponseMap | undefined;
  readonly reasoningKeys: readonly string[] | undefined;
  /** The openrouter transport's body shaper (the openai-compatible transport shapes in `transformRequestBody`). */
  readonly shapeBody?: ((body: Record<string, unknown>) => Record<string, unknown>) | undefined;
  readonly capture?:
    | {
        readonly sink: WireCaptureSink;
        readonly chatId: ChatId | undefined;
        readonly api: string;
        readonly wire: Wire;
        readonly providerId: string;
        readonly model: string;
        /** Tap the RESPONSE BODY too (§D2/§D3). Off by default and independently gated: the request capture
         *  is the operator's prompt, while the reply is the model's prose, which the recorder's outcome arm
         *  deliberately never keeps. A caller that does not ask gets today's request-and-headers entry. */
        readonly reply: boolean;
      }
    | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRedirect(res: Response): boolean {
  return res.type === "opaqueredirect" || (res.status >= REDIRECT_MIN && res.status <= REDIRECT_MAX);
}

/** What a capped read produced. `tearDown` is the abort / socket reset that ended it early — carried rather
 *  than thrown because the two callers want OPPOSITE things from it: the error-body path rethrows (a
 *  truncated error body must never reach the SDK's classifier dressed as a complete one), while the reply tap
 *  keeps the partial bytes (the reply of a turn that DIED is the one an operator went looking for, and its
 *  read runs on a floating promise where a throw would have nowhere to land). */
interface CappedRead {
  readonly text: string;
  readonly tearDown: { readonly error: unknown } | null;
}

/** Read one stream to `limit` UTF-16 code units, cancelling the source past it rather than draining it.
 *  `limit` is the DISPLAY cap PLUS `secretScrubOverhang` — see `scrubToLimit`. */
async function readCappedStream(body: ReadableStream<Uint8Array>, limit: number): Promise<CappedRead> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  let tearDown: { readonly error: unknown } | null = null;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        out += decoder.decode();
        break;
      }
      out += decoder.decode(chunk.value, { stream: true });
      if (out.length >= limit) {
        await reader.cancel();
        break;
      }
    }
    // @orb-waive caught-failure-ownership(error): the read failure is retained in `tearDown`; callers either rethrow it or deliberately keep partial capture bytes. Precedent: the gate mustPass fixture tooling/src/probe/unproven-outcome.ts proves the same carried failure-as-data owner. Ends if CappedRead stops carrying the error.
  } catch (error) {
    tearDown = { error };
  } finally {
    reader.releaseLock();
  }
  return { text: out.slice(0, limit), tearDown };
}

/** SCRUB BEFORE YOU MANGLE (#1820): a reader that truncates FIRST and scrubs SECOND cannot be saved by any
 *  later belt — a credential straddling the cut matches neither spelling, and its surviving PREFIX is real
 *  key material. So every read here OVER-reads by `secretScrubOverhang`, scrubs the WHOLE buffer, and only
 *  then slices to the display cap. Both byte directions of this file go through this one pair; `fetch-json`
 *  already obeyed it, this file did not until the reply tap gave it a second reader. */
function overreadLimit(secrets: ProviderScrubSet): number {
  return ERROR_BODY_LIMIT + secretScrubOverhang(secrets);
}

function scrubToLimit(text: string, secrets: ProviderScrubSet): string {
  return redactSecretsFromText(text, secrets).slice(0, ERROR_BODY_LIMIT);
}

/** The over-read, UNSCRUBBED error body. Every caller pairs it with `scrubToLimit`. */
async function readCapped(res: Response, secrets: ProviderScrubSet): Promise<string> {
  if (res.body === null) {
    return "";
  }
  const read = await readCappedStream(res.body, overreadLimit(secrets));
  if (read.tearDown !== null) {
    throw read.tearDown.error;
  }
  return read.text;
}

// ── responseMap ─────────────────────────────────────────────────────────────────────────────────────────

/** Every path present — `Required<ResponseMap>` keeps `| undefined` under `exactOptionalPropertyTypes`. */
type FullResponseMap = { readonly [K in keyof ResponseMap]-?: string };

/** The OpenAI-compatible defaults the user's dot paths OVERRIDE (an unset path keeps the default). */
const STREAM_DEFAULT_MAP: FullResponseMap = {
  contentPath: "choices.0.delta.content",
  reasoningPath: "choices.0.delta.reasoning",
  finishReasonPath: "choices.0.finish_reason",
  promptTokensPath: "usage.prompt_tokens",
  completionTokensPath: "usage.completion_tokens",
  errorMessagePath: "error.message",
  errorCodePath: "error.code",
  toolCallsPath: "choices.0.delta.tool_calls",
};
const BODY_DEFAULT_MAP: FullResponseMap = {
  contentPath: "choices.0.message.content",
  reasoningPath: "choices.0.message.reasoning",
  finishReasonPath: "choices.0.finish_reason",
  promptTokensPath: "usage.prompt_tokens",
  completionTokensPath: "usage.completion_tokens",
  errorMessagePath: "error.message",
  errorCodePath: "error.code",
  toolCallsPath: "choices.0.message.tool_calls",
};

function withResponseMap(base: FullResponseMap, override: ResponseMap | undefined): FullResponseMap {
  if (override === undefined) {
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

function readPath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const seg of path.split(".")) {
    if (cur === null || typeof cur !== "object") {
      return;
    }
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function reshapedUsage(raw: unknown, map: FullResponseMap): Record<string, unknown> {
  const promptTokens = readPath(raw, map.promptTokensPath);
  const completionTokens = readPath(raw, map.completionTokensPath);
  if (typeof promptTokens !== "number" && typeof completionTokens !== "number") {
    return {};
  }
  return { usage: { prompt_tokens: numberOrNull(promptTokens), completion_tokens: numberOrNull(completionTokens) } };
}

function reshapedError(raw: unknown, map: FullResponseMap): Record<string, unknown> {
  const errorMessage = readPath(raw, map.errorMessagePath);
  return typeof errorMessage === "string" ? { error: { message: errorMessage, code: readPath(raw, map.errorCodePath) ?? null } } : {};
}

function reshapedSlot(raw: unknown, map: FullResponseMap, stream: boolean): Record<string, unknown> {
  const content = readPath(raw, map.contentPath);
  const reasoning = readPath(raw, map.reasoningPath);
  const toolCalls = readPath(raw, map.toolCallsPath);
  return {
    content: typeof content === "string" ? content : null,
    ...(typeof reasoning === "string" ? { [REASONING_CONTENT_KEY]: reasoning } : {}),
    ...(Array.isArray(toolCalls) ? { tool_calls: toolCalls } : {}),
    ...(stream ? {} : { role: "assistant" }),
  };
}

/** Re-spell one raw event (a stream chunk or the whole body) onto the OpenAI shape the SDK's schema reads,
 *  through the user's dot paths. `delta` vs `message` follows the map in use. */
function reshape(raw: unknown, map: FullResponseMap, stream: boolean): Record<string, unknown> {
  const finishReason = readPath(raw, map.finishReasonPath);
  const id = isRecord(raw) && typeof raw["id"] === "string" ? { id: raw["id"] } : {};
  return {
    ...id,
    choices: [{ [stream ? "delta" : "message"]: reshapedSlot(raw, map, stream), finish_reason: typeof finishReason === "string" ? finishReason : null }],
    ...reshapedUsage(raw, map),
    ...reshapedError(raw, map),
  };
}

/** `features.reasoningKeys`: the FIRST present key in the delta/message becomes `reasoning_content` — the one
 *  key the SDK's chunk schema reads first (it also reads `reasoning`; a server using any OTHER spelling is
 *  the reason this exists — vLLM 0.26 renamed it, and a fixed read silently dropped every reasoning token). */
function normalizeReasoningKeys(raw: unknown, keys: readonly string[], stream: boolean): unknown {
  if (!(isRecord(raw) && Array.isArray(raw["choices"]))) {
    return raw;
  }
  const slotKey = stream ? "delta" : "message";
  const choices = raw["choices"].map((choice: unknown) => {
    if (!(isRecord(choice) && isRecord(choice[slotKey]))) {
      return choice;
    }
    const slot = choice[slotKey];
    const found = keys.find((key) => typeof slot[key] === "string" && slot[key] !== "");
    return found === undefined || found === REASONING_CONTENT_KEY ? choice : { ...choice, [slotKey]: { ...slot, [REASONING_CONTENT_KEY]: slot[found] } };
  });
  return { ...raw, choices };
}

function needsReshape(args: WrapFetchArgs): boolean {
  return args.responseMap !== undefined || (args.reasoningKeys !== undefined && args.reasoningKeys.length > 0);
}

function reshapeEvent(raw: unknown, args: WrapFetchArgs, stream: boolean): unknown {
  const mapped = args.responseMap === undefined ? raw : reshape(raw, withResponseMap(stream ? STREAM_DEFAULT_MAP : BODY_DEFAULT_MAP, args.responseMap), stream);
  return args.reasoningKeys === undefined ? mapped : normalizeReasoningKeys(mapped, args.reasoningKeys, stream);
}

function reshapedStream(body: ReadableStream<Uint8Array>, args: WrapFetchArgs): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const source = parseOpenAiSse(body);
  return new ReadableStream<Uint8Array>({
    async pull(controller): Promise<void> {
      const next = await source.next();
      if (next.done === true) {
        controller.enqueue(encoder.encode(SSE_DONE_LINE));
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(encodeSseData(reshapeEvent(next.value, args, true))));
    },
    async cancel(): Promise<void> {
      await source.return(undefined);
    },
  });
}

function notJsonError(label: string, cause: unknown): ProviderError {
  return new ProviderError({ kind: "server", retryable: true, message: `${label}: the endpoint declared a JSON body that did not parse`, cause });
}

function parseDeclaredJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw notJsonError(label, cause);
  }
}

async function reshapedResponse(res: Response, args: WrapFetchArgs): Promise<Response> {
  const contentType = (res.headers.get(CONTENT_TYPE) ?? "").toLowerCase();
  if (contentType.includes(EVENT_STREAM) && res.body !== null) {
    return new Response(reshapedStream(res.body, args), { status: res.status, statusText: res.statusText, headers: res.headers });
  }
  if (contentType.includes(JSON_CONTENT_TYPE)) {
    // A declared-JSON 2xx that does not parse is a `server` error, never an empty success (#1400).
    const text = await res.text();
    const parsed = parseDeclaredJson(text, args.label);
    return new Response(JSON.stringify(reshapeEvent(parsed, args, false)), { status: res.status, statusText: res.statusText, headers: res.headers });
  }
  return res;
}

// ── the request side ────────────────────────────────────────────────────────────────────────────────────

function parseBody(init: RequestInit | undefined): Record<string, unknown> | null {
  if (init === undefined || typeof init.body !== "string") {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(init.body);
    return isRecord(parsed) ? parsed : null;
    // @orb-waive caught-failure-ownership(catch): malformed SDK body bytes disable shaping and capture while the original request still travels unchanged. Precedent: the gate mustPass fixture packages/server/src/infra/auth/parser.ts proves the same fail-closed parse default. Ends if null starts authorizing transformed output.
  } catch {
    return null;
  }
}

/** Scrub the known credential literals out of a captured body BY VALUE, then re-parse to keep a valid object. */
function scrubCapturedBody(body: Record<string, unknown>, secrets: ProviderScrubSet): Record<string, unknown> {
  if (secrets.length === 0) {
    return body;
  }
  const scrubbed: unknown = JSON.parse(redactSecretsFromText(JSON.stringify(body), secrets));
  return isRecord(scrubbed) ? scrubbed : {};
}

/** The shaped outbound init, plus the scrubbed body the capture will record once the response is in hand. */
interface Outbound {
  readonly init: RequestInit;
  readonly capturedBody: Record<string, unknown> | null;
}

function outbound(args: WrapFetchArgs, init: RequestInit | undefined): Outbound {
  const parsed = parseBody(init);
  if (parsed === null) {
    return { init: { ...init, redirect: "manual" }, capturedBody: null };
  }
  const shaped = args.shapeBody === undefined ? parsed : args.shapeBody(parsed);
  return {
    init: { ...init, ...(shaped === parsed ? {} : { body: JSON.stringify(shaped) }), redirect: "manual" },
    capturedBody: args.capture === undefined ? null : scrubCapturedBody(shaped, args.secrets),
  };
}

/** Response headers → a plain record, secret-scrubbed by value like the body (a header is not a place we
 *  expect a credential, but the sink's contract is "scrubbed", and a contract with an exception is not one). */
function capturedHeaders(headers: Headers, secrets: ProviderScrubSet): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = redactSecretsFromText(value, secrets);
  });
  return out;
}

/** Record ONE send. Emitted AFTER the attempt rather than before it, so the request and what came back ride
 *  the same ring entry (§D1) — a request row whose response is a separate row cannot be correlated, and the
 *  bytes here are the FINAL ones (post-`transformRequestBody`, post-`shapeBody`), which is strictly more
 *  faithful than the SDK result's own `request.body`. A failed attempt still records, with no headers. */
function emitCapture(args: WrapFetchArgs, body: Record<string, unknown> | null, headers: Headers | undefined, reply: string | undefined): void {
  if (args.capture === undefined || body === null) {
    return;
  }
  args.capture.sink({
    chatId: args.capture.chatId,
    api: args.capture.api,
    wire: args.capture.wire,
    providerId: args.capture.providerId,
    model: args.capture.model,
    body,
    ...(headers !== undefined ? { responseHeaders: capturedHeaders(headers, args.secrets) } : {}),
    // Scrubbed HERE, on the same terms as the body and the headers: a provider that echoes a request back
    // (OpenRouter's `debug.echo_upstream_body` is exactly that) hands us our own key-in-body credential, and
    // OR's own redaction is the provider's belt, not ours.
    ...(reply !== undefined ? { responseBody: scrubToLimit(reply, args.secrets) } : {}),
  });
}

function capturesReply(args: WrapFetchArgs): boolean {
  return args.capture?.reply === true;
}

/** Control 4b: hand the SDK one tee branch and drain the other ourselves, then emit the ONE entry the whole
 *  send produced. Owning a branch rather than wrapping the consumer's is what makes the deferral safe — a
 *  reader the SDK RELEASES without cancelling (`drainStream`'s `finally`, on the truncated-turn throw) would
 *  never run a pass-through's flush, and the entry of a turn that broke is the one worth having. */
function tapReply(res: Response, args: WrapFetchArgs, body: Record<string, unknown> | null): Response {
  if (res.body === null) {
    emitCapture(args, body, res.headers, undefined);
    return res;
  }
  const [downstream, ours] = res.body.tee();
  const emit = (reply: string): void => {
    emitCapture(args, body, res.headers, reply);
  };
  // @orb-waive caught-failure-ownership(readCappedStream): both settlement arms emit the capture row; the reader currently carries teardown instead of rejecting. Precedent: packages/client/src/lib/app-ready-signal.ts accepts the same both-arms terminal settlement owner. Ends if either arm stops emitting.
  void readCappedStream(ours, overreadLimit(args.secrets)).then(
    (read) => {
      emit(read.text);
    },
    // Unreachable by construction — `readCappedStream` CARRIES its tear-down in `CappedRead` rather than
    // throwing. The arm is here because that guarantee is internal to this file while the floating read is
    // the only thing standing between a send and its ring row: it emits, it never swallows.
    () => {
      emit("");
    },
  );
  return new Response(downstream, { status: res.status, statusText: res.statusText, headers: res.headers });
}

function redirectRefused(args: WrapFetchArgs, res: Response): ProviderError {
  return new ProviderError({
    kind: "invalid",
    retryable: false,
    message: `${args.label}: the endpoint answered ${res.status} with a redirect, which is never followed (host pin)`,
    apiErrorStatus: res.status,
  });
}

/** Control 3: capped + scrubbed, then re-framed so the SDK's failed-response handler reads a bounded body.
 *  The capture rides the SAME text — on a failure the error body IS the reply, and it is already in hand. */
async function failedResponse(args: WrapFetchArgs, res: Response, body: Record<string, unknown> | null): Promise<Response> {
  const raw = await readCapped(res, args.secrets);
  // The entry takes the RAW over-read text: `emitCapture` runs the same scrub-then-slice pair, and handing it
  // the already-sliced copy would re-introduce the truncate-first order the pair exists to avoid.
  emitCapture(args, body, res.headers, capturesReply(args) ? raw : undefined);
  return new Response(scrubToLimit(raw, args.secrets), { status: res.status, statusText: res.statusText, headers: res.headers });
}

/** The wrapped `fetch`: host-pinned, error-body-capped, response-reshaped, wire-captured. */
export function wrapFetch(args: WrapFetchArgs): typeof fetch {
  return async (input, init): Promise<Response> => {
    const prepared = outbound(args, init);
    let res: Response;
    try {
      res = await args.fetch(input, prepared.init);
    } catch (err) {
      emitCapture(args, prepared.capturedBody, undefined, undefined);
      throw err;
    }
    if (isRedirect(res)) {
      // A redirect's body is never read, so there is nothing to defer for: emit now, exactly as before.
      emitCapture(args, prepared.capturedBody, res.headers, undefined);
      throw redirectRefused(args, res);
    }
    if (!res.ok) {
      return await failedResponse(args, res, prepared.capturedBody);
    }
    // Tapped BEFORE any reshaping: the capture's whole claim is that it holds the literal wire, and
    // `reshapedResponse` re-spells a non-OpenAI reply onto the SDK's schema.
    const tapped = capturesReply(args) ? tapReply(res, args, prepared.capturedBody) : res;
    if (!capturesReply(args)) {
      emitCapture(args, prepared.capturedBody, res.headers, undefined);
    }
    return needsReshape(args) ? await reshapedResponse(tapped, args) : tapped;
  };
}
