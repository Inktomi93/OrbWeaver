// `PostEventSource` — the EventSource `httpSubscriptionLink` opens, over POST (easy-sharing plan, leg T): a
// relay that buffers every GET body (a Cloudflare quick tunnel) freezes a GET EventSource, and a POST body
// streams. It keeps the native lifecycle the tRPC consumer reads: `error` at CLOSED is terminal.

import { CSRF_HEADER } from "@orb/contracts/identity";
import { STREAM_INACTIVITY_TIMEOUT_MS } from "@orb/contracts/stream";
import { jsonValueSchema } from "@orb/kit/json";

/** The reconnect delay before the stream sends a `retry:` field, near what browsers use natively. */
const DEFAULT_RETRY_MS = 3000;
const MIN_RETRY_MS = 100;
const MAX_RETRY_MS = 30_000;
const MAX_RETRIES = 5;
const OPENING_TIMEOUT_MS = 15_000;
const BACKOFF_FACTOR = 2;
const JITTER_FLOOR = 0.5;
const MS_PER_SECOND = 1000;
const INPUT_PARAM = "input";
const EVENT_STREAM = "text/event-stream";
const JSON_BODY = "application/json";
const RETURN_EVENT = "return";
const CONNECTED_EVENT = "connected";
const REQUEST_TIMEOUT = 408;
const TOO_MANY_REQUESTS = 429;
const INTERNAL_SERVER_ERROR = 500;
const BAD_GATEWAY = 502;
const SERVICE_UNAVAILABLE = 503;
const GATEWAY_TIMEOUT = 504;
const TRANSIENT_STATUSES = new Set([REQUEST_TIMEOUT, TOO_MANY_REQUESTS, INTERNAL_SERVER_ERROR, BAD_GATEWAY, SERVICE_UNAVAILABLE, GATEWAY_TIMEOUT]);
const OK = 200;
const LINE_BREAK = /\r\n|\r|\n/;
const DIGITS = /^\d+$/;

type ScheduleOp = (fn: () => void, ms: number) => () => void;

/** Native init options, per-operation replay policy and bounded scheduling seams. */
interface PostEventSourceInit {
  readonly withCredentials?: boolean;
  readonly schedule?: ScheduleOp;
  readonly reconnect?: boolean;
  readonly maxRetries?: number;
  readonly maxRetryDelayMs?: number;
  readonly openingTimeoutMs?: number;
  readonly inactivityTimeoutMs?: number;
  readonly random?: () => number;
  readonly now?: () => number;
}

interface ConnectionAttempt {
  readonly abort: AbortController;
  cancelDeadline: (() => void) | null;
  deadlineEpoch: symbol | null;
  reader: ReadableStreamDefaultReader<Uint8Array> | null;
  connected: boolean;
  retryAfterMs: number;
}

interface EventBuffer {
  type: string;
  data: string;
  id: string;
}

class StreamFailureEvent extends Event {
  readonly message: string;

  constructor(message: string) {
    super("error");
    this.message = message;
  }
}

const scheduleWithTimers: ScheduleOp = (fn, ms) => {
  const timer = setTimeout(fn, ms);
  return () => clearTimeout(timer);
};

/** Split a subscription URL into the POST target and the JSON body its `input` parameter becomes. */
function toPostRequest(url: string): { readonly target: string; readonly body: string | undefined } {
  const queryStart = url.indexOf("?");
  if (queryStart === -1) {
    return { target: url, body: undefined };
  }
  const params = new URLSearchParams(url.slice(queryStart + 1));
  const input = params.get(INPUT_PARAM);
  params.delete(INPUT_PARAM);
  const query = params.toString();
  const path = url.slice(0, queryStart);
  return { target: query === "" ? path : `${path}?${query}`, body: input ?? undefined };
}

/** A terminal answer: the native EventSource fails the connection on anything but a 200 event stream. */
function isTerminal(response: Response): boolean {
  const contentType = response.headers.get("content-type") ?? "";
  return response.status !== OK || contentType.split(";")[0]?.trim().toLowerCase() !== EVENT_STREAM;
}

function retryAfterDelay(response: Response, now: number, max: number): number {
  const value = response.headers.get("retry-after")?.trim();
  if (value === undefined) {
    return 0;
  }
  const delay = DIGITS.test(value) ? Number(value) * MS_PER_SECOND : Date.parse(value) - now;
  return delay > 0 ? Math.min(delay, max) : 0;
}

/** One connection's line framing: splits on CRLF, CR or LF across chunk boundaries and holds back an
 *  unterminated tail. The stream's leading BOM never reaches it; `TextDecoder` strips it by default. */
function createLineSplitter(): (text: string) => readonly string[] {
  let pendingLine = "";
  let previousEndedInCr = false;
  return (decoded) => {
    if (decoded === "") {
      return [];
    }
    // A CR that ended the previous chunk already terminated its line; its LF half must not add a blank line.
    const text = previousEndedInCr && decoded.startsWith("\n") ? decoded.slice(1) : decoded;
    previousEndedInCr = text.endsWith("\r");
    const lines = (pendingLine + text).split(LINE_BREAK);
    pendingLine = lines.pop() ?? "";
    return lines;
  };
}

/**
 * An EventSource that opens with a JSON POST, for `httpSubscriptionLink`'s `EventSource` option.
 *
 * @remarks
 * The `input` query parameter moves into the body and the CSRF header rides every request. The body is
 * parsed with the WHATWG SSE grammar. A subscription with no input would send an empty body, which the
 * server's JSON handler refuses; every subscription here takes an input. A reconnect fires a plain,
 * data-less `error`: a connecting error that carried a tRPC error shape would read as a server fault to
 * `useGuidedActions`.
 */
export class PostEventSource extends EventTarget {
  // biome-ignore lint/style/useNamingConvention: the EventSource contract names this constant.
  readonly CONNECTING = 0;
  // biome-ignore lint/style/useNamingConvention: the EventSource contract names this constant.
  readonly OPEN = 1;
  // biome-ignore lint/style/useNamingConvention: the EventSource contract names this constant.
  readonly CLOSED = 2;
  readyState: number = this.CONNECTING;

  readonly #target: string;
  readonly #body: string | undefined;
  #retryMs = DEFAULT_RETRY_MS;
  #lastEventId = "";
  #attempt: ConnectionAttempt | null = null;
  readonly #schedule: ScheduleOp;
  readonly #reconnect: boolean;
  readonly #maxRetries: number;
  readonly #maxRetryDelayMs: number;
  readonly #openingTimeoutMs: number;
  readonly #inactivityTimeoutMs: number;
  readonly #random: () => number;
  readonly #now: () => number;
  #retries = 0;
  #cancelReconnect: (() => void) | null = null;

  constructor(url: string, init?: PostEventSourceInit) {
    super();
    this.#schedule = init?.schedule ?? scheduleWithTimers;
    this.#reconnect = init?.reconnect ?? true;
    this.#maxRetries = init?.maxRetries ?? MAX_RETRIES;
    this.#maxRetryDelayMs = init?.maxRetryDelayMs ?? MAX_RETRY_MS;
    this.#openingTimeoutMs = init?.openingTimeoutMs ?? OPENING_TIMEOUT_MS;
    this.#inactivityTimeoutMs = init?.inactivityTimeoutMs ?? STREAM_INACTIVITY_TIMEOUT_MS;
    this.#random = init?.random ?? Math.random;
    this.#now = init?.now ?? Date.now;
    const request = toPostRequest(url);
    this.#target = request.target;
    this.#body = request.body;
    this.#start();
  }

  close(): void {
    this.readyState = this.CLOSED;
    this.#attempt?.cancelDeadline?.();
    this.#attempt?.abort.abort();
    this.#cancelReconnect?.();
    this.#cancelReconnect = null;
  }

  #start(): void {
    const attempt: ConnectionAttempt = {
      abort: new AbortController(),
      cancelDeadline: null,
      deadlineEpoch: null,
      reader: null,
      connected: false,
      retryAfterMs: 0,
    };
    this.#attempt = attempt;
    this.#cancelReconnect = null;
    // @orb-waive caught-failure-ownership(this.#connect): transport failures are owned by the bounded reconnect policy; one-shot/exhausted streams emit a terminal error consumed by the existing failure UI. Ends if #scheduleReconnect stops publishing those failures.
    this.#connect(attempt).then(
      () => this.#scheduleReconnect(attempt),
      () => this.#scheduleReconnect(attempt),
    );
  }

  #owns(attempt: ConnectionAttempt): boolean {
    return this.#attempt === attempt && this.readyState !== this.CLOSED && !attempt.abort.signal.aborted;
  }

  #deadline(attempt: ConnectionAttempt, ms: number): void {
    attempt.cancelDeadline?.();
    const epoch = Symbol("SSE deadline");
    attempt.deadlineEpoch = epoch;
    const cancel = this.#schedule(() => {
      if (attempt.deadlineEpoch === epoch && this.#owns(attempt)) {
        attempt.abort.abort(new Error("The live connection timed out."));
      }
    }, ms);
    attempt.cancelDeadline = (): void => {
      if (attempt.deadlineEpoch === epoch) {
        attempt.deadlineEpoch = null;
      }
      cancel();
    };
  }

  async #connect(attempt: ConnectionAttempt): Promise<void> {
    const { abort } = attempt;
    const cancelled = Promise.withResolvers<never>();
    const onAbort = (): void => cancelled.reject(abort.signal.reason);
    abort.signal.addEventListener("abort", onAbort, { once: true });
    this.#deadline(attempt, this.#openingTimeoutMs);
    const headers: Record<string, string> = { "content-type": JSON_BODY, accept: EVENT_STREAM, [CSRF_HEADER]: "1" };
    if (this.#lastEventId !== "") {
      headers["last-event-id"] = this.#lastEventId;
    }
    try {
      const fetching = fetch(this.#target, {
        method: "POST",
        headers,
        ...(this.#body === undefined ? {} : { body: this.#body }),
        credentials: "same-origin",
        signal: abort.signal,
      }).then(async (answer) => {
        if (!this.#owns(attempt)) {
          await answer.body?.cancel();
          throw abort.signal.reason;
        }
        return answer;
      });
      const response = await Promise.race([fetching, cancelled.promise]);
      if (TRANSIENT_STATUSES.has(response.status) && this.#reconnect) {
        attempt.retryAfterMs = retryAfterDelay(response, this.#now(), this.#maxRetryDelayMs);
        await response.body?.cancel();
        return;
      }
      const body = response.body;
      if (body === null || isTerminal(response)) {
        this.#fail("The server refused the live connection.");
        await body?.cancel();
        return;
      }
      this.readyState = this.OPEN;
      this.dispatchEvent(new Event("open"));
      await this.#read(attempt, body, cancelled.promise);
    } finally {
      attempt.cancelDeadline?.();
      abort.signal.removeEventListener("abort", onAbort);
      abort.abort();
      const reader = attempt.reader;
      if (reader !== null) {
        try {
          await reader.cancel();
        } finally {
          reader.releaseLock();
          attempt.reader = null;
        }
      }
    }
  }

  #fail(message: string): void {
    this.close();
    this.dispatchEvent(new StreamFailureEvent(message));
  }

  #scheduleReconnect(attempt: ConnectionAttempt): void {
    if (this.readyState === this.CLOSED || this.#attempt !== attempt) {
      return;
    }
    if (!this.#reconnect || this.#retries >= this.#maxRetries) {
      this.#fail(this.#reconnect ? "Reconnecting failed. Try again." : "The generation connection ended unexpectedly.");
      return;
    }
    const exponential = Math.min(this.#retryMs * BACKOFF_FACTOR ** this.#retries, this.#maxRetryDelayMs);
    const jittered = exponential * (JITTER_FLOOR + JITTER_FLOOR * this.#random());
    const delay = Math.min(this.#maxRetryDelayMs, Math.max(MIN_RETRY_MS, jittered, attempt.retryAfterMs));
    this.#retries += 1;
    this.readyState = this.CONNECTING;
    this.dispatchEvent(new Event("error"));
    // A listener may have closed the source in answer to that error.
    if (this.readyState === this.CONNECTING) {
      this.#cancelReconnect = this.#schedule(() => {
        if (this.#attempt === attempt && this.readyState === this.CONNECTING) {
          this.#start();
        }
      }, delay);
    }
  }

  async #read(attempt: ConnectionAttempt, body: ReadableStream<Uint8Array>, cancelled: Promise<never>): Promise<void> {
    const decoder = new TextDecoder();
    const splitLines = createLineSplitter();
    // Only a blank-line commit updates the resume ID; unfinished connection-local state is discarded.
    const buffer: EventBuffer = { type: "", data: "", id: this.#lastEventId };
    // A reader loop, not `for await`: Safari does not iterate a ReadableStream.
    const reader = body.getReader();
    attempt.reader = reader;
    for (let next = await Promise.race([reader.read(), cancelled]); !next.done; next = await Promise.race([reader.read(), cancelled])) {
      if (!this.#owns(attempt)) {
        return;
      }
      if (attempt.connected) {
        this.#deadline(attempt, this.#inactivityTimeoutMs);
      }
      for (const line of splitLines(decoder.decode(next.value, { stream: true }))) {
        this.#processLine(line, buffer, attempt);
        if (!this.#owns(attempt)) {
          return;
        }
      }
    }
  }

  #processLine(line: string, buffer: EventBuffer, attempt: ConnectionAttempt): void {
    if (line === "") {
      this.#dispatchBufferedEvent(buffer, attempt);
      return;
    }
    if (line.startsWith(":")) {
      return;
    }
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }
    if (field === "event") {
      buffer.type = value;
    } else if (field === "data") {
      buffer.data += `${value}\n`;
    } else if (field === "id" && !value.includes("\0")) {
      buffer.id = value;
    } else if (field === "retry" && DIGITS.test(value)) {
      this.#retryMs = Math.min(this.#maxRetryDelayMs, Math.max(MIN_RETRY_MS, Number(value)));
    }
  }

  #connectedPayload(payload: string): string | null {
    // @orb-waive caught-failure-ownership(catch): malformed connected metadata is a terminal wire refusal, surfaced by #fail to the existing subscription error UI. Ends if that terminal error is removed.
    try {
      const options = jsonValueSchema.parse(JSON.parse(payload));
      if (typeof options !== "object" || !options || Array.isArray(options)) {
        this.#fail("The server sent an invalid connection frame.");
        return null;
      }
      // The native watchdog recreates EventSource outside this adapter's retry budget; only that
      // instruction is removed. Other metadata and ordinary event payloads remain unchanged.
      const { reconnectAfterInactivityMs: _nativeWatchdog, ...forwarded } = options;
      return JSON.stringify(forwarded);
    } catch {
      this.#fail("The server sent an invalid connection frame.");
      return null;
    }
  }

  #dispatchBufferedEvent(buffer: EventBuffer, attempt: ConnectionAttempt): void {
    this.#lastEventId = buffer.id;
    if (buffer.data === "") {
      buffer.type = "";
      return;
    }
    const type = buffer.type === "" ? "message" : buffer.type;
    let payload = buffer.data.slice(0, -1);
    buffer.type = "";
    buffer.data = "";
    if (type === CONNECTED_EVENT) {
      const connected = this.#connectedPayload(payload);
      if (connected === null) {
        return;
      }
      payload = connected;
      attempt.connected = true;
      this.#retries = 0;
      this.#deadline(attempt, this.#inactivityTimeoutMs);
    }
    this.dispatchEvent(new MessageEvent(type, { data: payload, lastEventId: this.#lastEventId }));
    if (type === RETURN_EVENT) {
      this.close();
    }
  }
}
