// The mirror for `packages/client/src/data/bus/post-event-source.ts`: the SSE grammar, the terminal answers
// that must never reconnect, and the reconnect a body end must make. The stubbed fetch is the wire; the
// reconnect timer is the injected seam, so a `retry:` delay is an exact observation, not a wait.
import { PostEventSource } from "@orb/client/data";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { afterEach, beforeEach, describe, vi } from "vitest";
import type { ManualTimer } from "../../../support/clock.ts";
import { createManualTimer } from "../../../support/clock.ts";
import { expect, test } from "../../../support/fixtures.ts";

interface SentRequest {
  readonly url: string;
  readonly init: RequestInit;
}

const sent: SentRequest[] = [];
const answers: (() => Response)[] = [];

const URL_WITH_INPUT = `http://localhost/api/trpc/stream.connect?input=${encodeURIComponent(JSON.stringify({ socketId: "sock_1" }))}&connectionParams=1`;
const SERVER_DEFAULT_RETRY_MS = 3000;
const BYTE_ORDER_MARK_CODE_POINT = 0xfe_ff;
const BYTE_ORDER_MARK = String.fromCodePoint(BYTE_ORDER_MARK_CODE_POINT);
let timer: ManualTimer = createManualTimer();

function open(url: string = URL_WITH_INPUT): PostEventSource {
  return new PostEventSource(url, { schedule: timer.schedule });
}

/** An SSE response that delivers `chunks` then ends, honoring the request's abort like a real fetch body. */
function eventStream(chunks: readonly string[], signal?: AbortSignal | null, keepOpen = false): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller): void {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
      if (!keepOpen) {
        controller.close();
      }
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/** Queue the answer to the next fetch; each answer is built at request time so it can see the signal. */
function answerWith(build: (signal: AbortSignal | null | undefined) => Response): void {
  answers.push(() => build(sent.at(-1)?.init.signal));
}

function nextEvent(source: PostEventSource, type: string): Promise<Event> {
  return new Promise((resolve) => source.addEventListener(type, resolve, { once: true }));
}

/** One macrotask turn: every microtask queued before it has run. */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function header(request: SentRequest | undefined, name: string): string | null {
  return new Headers(request?.init.headers).get(name);
}

beforeEach(() => {
  sent.length = 0;
  answers.length = 0;
  timer = createManualTimer();
  vi.stubGlobal("fetch", (input: string, init: RequestInit): Promise<Response> => {
    sent.push({ url: input, init });
    const answer = answers.shift();
    return answer === undefined ? new Promise<Response>(() => undefined) : Promise.resolve(answer());
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PostEventSource", () => {
  test("sends the query's input as a JSON POST body with the CSRF header, keeping every other parameter", () => {
    const source = open();
    source.close();

    const [request] = sent;
    expect(request?.init.method).toBe("POST");
    expect(request?.url).toBe("http://localhost/api/trpc/stream.connect?connectionParams=1");
    expect(request?.init.body).toBe(JSON.stringify({ socketId: "sock_1" }));
    expect(header(request, "content-type")).toBe("application/json");
    expect(header(request, "accept")).toBe("text/event-stream");
    expect(header(request, CSRF_HEADER)).toBe("1");
    expect(request?.init.credentials).toBe("same-origin");
  });

  test("parses event, data, id, retry and multi-line data per the SSE grammar, across chunk and CRLF splits", async () => {
    answerWith((signal) =>
      eventStream(
        [
          // A BOM left in place would turn the first field name into an unknown one; the decoder strips it.
          `${BYTE_ORDER_MARK}event: connected\ndata: {"a":1}\n\n`,
          ": a comment line\n",
          "data: line one\r",
          "\ndata:line two\nid: 7\nretry: 250\n\n",
          "data: after\n\n",
          "event: ping\ndata:\n\n",
          "data: an unterminated event is discarded",
        ],
        signal,
      ),
    );
    const source = open();
    const seen: { type: string; data: unknown; lastEventId: string }[] = [];
    for (const type of ["connected", "message", "ping"]) {
      source.addEventListener(type, (event) => {
        const message = event as MessageEvent;
        seen.push({ type: message.type, data: message.data, lastEventId: message.lastEventId });
      });
    }
    await nextEvent(source, "error");

    expect(seen).toEqual([
      { type: "connected", data: '{"a":1}', lastEventId: "" },
      { type: "message", data: "line one\nline two", lastEventId: "7" },
      { type: "message", data: "after", lastEventId: "7" },
      { type: "ping", data: "", lastEventId: "7" },
    ]);
    // The `retry:` value re-times the reconnect, and the reconnect resumes from the last id.
    expect(timer.armed()).toEqual([250]);
    expect(sent).toHaveLength(1);
    timer.fire();
    expect(sent).toHaveLength(2);
    expect(header(sent[1], "last-event-id")).toBe("7");
    source.close();
  });

  test("a CR, a lone LF and a second LF in three chunks still end the event", async () => {
    answerWith((signal) => eventStream(["data: a\r", "\n", "\ndata: b\n\n"], signal));
    const source = open();
    const seen: unknown[] = [];
    source.addEventListener("message", (event) => seen.push((event as MessageEvent).data));
    await nextEvent(source, "error");

    expect(seen).toEqual(["a", "b"]);
    source.close();
  });

  test.each([
    ["a 204", (): Response => new Response(null, { status: 204 })],
    ["a 401", (): Response => new Response("{}", { status: 401, headers: { "content-type": "text/event-stream" } })],
    ["a JSON body", (): Response => new Response("[]", { status: 200, headers: { "content-type": "application/json" } })],
  ])("%s ends CLOSED with one error and never fetches again", async (_name, answer) => {
    answerWith(answer);
    const source = open();
    const errors: Event[] = [];
    source.addEventListener("error", (event) => errors.push(event));
    await nextEvent(source, "error");

    await settle();
    expect(source.readyState).toBe(source.CLOSED);
    expect(timer.armed()).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  test("a body that ends fires a data-less error at CONNECTING and refetches after the default delay", async () => {
    answerWith((signal) => eventStream(["event: connected\ndata: {}\n\n"], signal));
    const source = open();
    const opened = nextEvent(source, "open");
    const error = await nextEvent(source, "error");
    await opened;

    expect(source.readyState).toBe(source.CONNECTING);
    // A connecting error that carried a tRPC error shape would read as a server fault downstream.
    expect(error.constructor).toBe(Event);
    expect("data" in error).toBe(false);
    expect(timer.armed()).toEqual([SERVER_DEFAULT_RETRY_MS]);
    expect(sent).toHaveLength(1);
    timer.fire();
    expect(sent).toHaveLength(2);
    source.close();
  });

  test("close() during a live stream stops every refetch", async () => {
    answerWith((signal) => eventStream(["event: connected\ndata: {}\n\n"], signal, true));
    const source = open();
    await nextEvent(source, "connected");
    const errors: Event[] = [];
    source.addEventListener("error", (event) => errors.push(event));

    source.close();
    // The abort rejects the pending read a few microtasks later; a macrotask turn lets all of it land.
    await settle();
    expect(timer.armed()).toEqual([]);
    expect(source.readyState).toBe(source.CLOSED);
    expect(errors).toEqual([]);
    expect(sent).toHaveLength(1);
  });

  test("close() while a reconnect is pending cancels it", async () => {
    answerWith((signal) => eventStream([], signal));
    const source = open();
    await nextEvent(source, "error");

    expect(timer.armed()).toEqual([SERVER_DEFAULT_RETRY_MS]);

    source.close();
    expect(timer.cancelled()).toEqual([SERVER_DEFAULT_RETRY_MS]);
    expect(timer.armed()).toEqual([]);
    expect(sent).toHaveLength(1);
  });

  test("the `return` event closes the source, so the body end that follows reconnects nothing", async () => {
    answerWith((signal) => eventStream(["event: connected\ndata: {}\n\n", "event: return\ndata: \n\n"], signal));
    const source = open();
    const errors: Event[] = [];
    source.addEventListener("error", (event) => errors.push(event));
    await nextEvent(source, "return");
    await settle();

    expect(timer.armed()).toEqual([]);
    expect(source.readyState).toBe(source.CLOSED);
    expect(errors).toEqual([]);
    expect(sent).toHaveLength(1);
  });

  test("CONTROL: removeEventListener silences a listener before the next event", async () => {
    answerWith((signal) => eventStream(["data: first\n\n", "data: second\n\n"], signal, true));
    const source = open();
    const heard: unknown[] = [];
    const listener = (event: Event): void => {
      heard.push((event as MessageEvent).data);
      source.removeEventListener("message", listener);
    };
    source.addEventListener("message", listener);
    const second = new Promise<void>((resolve) => {
      source.addEventListener("message", (event) => {
        if ((event as MessageEvent).data === "second") {
          resolve();
        }
      });
    });
    await second;

    expect(heard).toEqual(["first"]);
    source.close();
  });
});
