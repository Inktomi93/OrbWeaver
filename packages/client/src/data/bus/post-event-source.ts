// `PostEventSource` — the EventSource `httpSubscriptionLink` opens, over POST (easy-sharing plan, leg T): a
// relay that buffers every GET body (a Cloudflare quick tunnel) freezes a GET EventSource, and a POST body
// streams. It keeps the native lifecycle the tRPC consumer reads: `error` at CLOSED is terminal.

import { CSRF_HEADER } from "@orb/contracts/identity";

/** The reconnect delay before the stream sends a `retry:` field, near what browsers use natively. */
const DEFAULT_RETRY_MS = 3000;
const INPUT_PARAM = "input";
const EVENT_STREAM = "text/event-stream";
const JSON_BODY = "application/json";
const RETURN_EVENT = "return";
const OK = 200;
const LINE_BREAK = /\r\n|\r|\n/;
const DIGITS = /^\d+$/;

type ScheduleOp = (fn: () => void, ms: number) => () => void;

/** The native init dict plus the reconnect timer seam; the tRPC link passes neither. */
interface PostEventSourceInit {
  readonly withCredentials?: boolean;
  readonly schedule?: ScheduleOp;
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
  return response.status !== OK || !contentType.startsWith(EVENT_STREAM);
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
  #abort: AbortController | null = null;
  readonly #schedule: ScheduleOp;
  #cancelReconnect: (() => void) | null = null;

  // The SSE grammar's event buffers; the line state is per connection and lives in `#read`.
  #eventType = "";
  #data = "";
  #eventIdBuffer = "";

  constructor(url: string, init?: PostEventSourceInit) {
    super();
    this.#schedule = init?.schedule ?? scheduleWithTimers;
    const request = toPostRequest(url);
    this.#target = request.target;
    this.#body = request.body;
    this.#start();
  }

  close(): void {
    this.readyState = this.CLOSED;
    this.#abort?.abort();
    this.#cancelReconnect?.();
    this.#cancelReconnect = null;
  }

  #start(): void {
    // @orb-waive caught-failure-ownership(this.#connect): a failed fetch or a broken body is a dropped connection, exactly like a clean end; its owner is the `error` event `#scheduleReconnect` dispatches to the tRPC consumer, and it does nothing once the source is closed.
    this.#connect().then(
      () => this.#scheduleReconnect(),
      () => this.#scheduleReconnect(),
    );
  }

  async #connect(): Promise<void> {
    this.#cancelReconnect = null;
    const abort = new AbortController();
    this.#abort = abort;
    const headers: Record<string, string> = { "content-type": JSON_BODY, accept: EVENT_STREAM, [CSRF_HEADER]: "1" };
    if (this.#lastEventId !== "") {
      headers["last-event-id"] = this.#lastEventId;
    }
    const response = await fetch(this.#target, {
      method: "POST",
      headers,
      ...(this.#body === undefined ? {} : { body: this.#body }),
      credentials: "same-origin",
      signal: abort.signal,
    });
    if (this.readyState === this.CLOSED) {
      return;
    }
    const body = response.body;
    if (body === null || isTerminal(response)) {
      this.readyState = this.CLOSED;
      this.dispatchEvent(new Event("error"));
      await body?.cancel();
      return;
    }
    this.readyState = this.OPEN;
    this.dispatchEvent(new Event("open"));
    await this.#read(body);
  }

  #scheduleReconnect(): void {
    if (this.readyState === this.CLOSED) {
      return;
    }
    this.readyState = this.CONNECTING;
    this.#eventType = "";
    this.#data = "";
    this.dispatchEvent(new Event("error"));
    // A listener may have closed the source in answer to that error.
    if (this.readyState === this.CONNECTING) {
      this.#cancelReconnect = this.#schedule(() => this.#start(), this.#retryMs);
    }
  }

  async #read(body: ReadableStream<Uint8Array>): Promise<void> {
    const decoder = new TextDecoder();
    const splitLines = createLineSplitter();
    // A reader loop, not `for await`: Safari does not iterate a ReadableStream.
    const reader = body.getReader();
    for (let next = await reader.read(); !next.done; next = await reader.read()) {
      for (const line of splitLines(decoder.decode(next.value, { stream: true }))) {
        this.#processLine(line);
        if (this.readyState === this.CLOSED) {
          await reader.cancel();
          return;
        }
      }
    }
  }

  #processLine(line: string): void {
    if (line === "") {
      this.#dispatchBufferedEvent();
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
      this.#eventType = value;
    } else if (field === "data") {
      this.#data += `${value}\n`;
    } else if (field === "id" && !value.includes("\0")) {
      this.#eventIdBuffer = value;
    } else if (field === "retry" && DIGITS.test(value)) {
      this.#retryMs = Number(value);
    }
  }

  #dispatchBufferedEvent(): void {
    this.#lastEventId = this.#eventIdBuffer;
    if (this.#data === "") {
      this.#eventType = "";
      return;
    }
    const type = this.#eventType === "" ? "message" : this.#eventType;
    const data = this.#data.slice(0, -1);
    this.#eventType = "";
    this.#data = "";
    this.dispatchEvent(new MessageEvent(type, { data, lastEventId: this.#lastEventId }));
    if (type === RETURN_EVENT) {
      this.close();
    }
  }
}
