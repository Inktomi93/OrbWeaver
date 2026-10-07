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
  return new PostEventSource(url, { schedule: scheduleStep, random: () => 1 });
}

// Real timer callbacks cannot also fire the timers they arm in the same task.
function scheduleStep(fn: () => void, ms: number): () => void {
  return timer.schedule(() => queueMicrotask(fn), ms);
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
  test("configured retry cap and budget remain bounded with jitter", async () => {
    answerWith(() => new Response("unavailable", { status: 503 }));
    answerWith(() => new Response("unavailable", { status: 503 }));
    const source = new PostEventSource(URL_WITH_INPUT, { schedule: scheduleStep, maxRetries: 1, maxRetryDelayMs: 1000, random: () => 0 });
    await nextEvent(source, "error");
    expect(timer.armed()).toEqual([500]);
    timer.fire();
    await nextEvent(source, "error");
    expect(source.readyState).toBe(source.CLOSED);
    expect(timer.armed()).toEqual([]);
    expect(sent).toHaveLength(2);
  });

  test("close before late headers cancels the response body and publishes no late events", async () => {
    const answer = Promise.withResolvers<Response>();
    vi.stubGlobal("fetch", (_input: string, init: RequestInit): Promise<Response> => {
      sent.push({ url: URL_WITH_INPUT, init });
      return answer.promise;
    });
    const source = open();
    const events: string[] = [];
    source.addEventListener("open", () => events.push("open"));
    source.addEventListener("message", () => events.push("message"));
    source.close();
    let cancelled = false;
    answer.resolve(
      new Response(
        new ReadableStream<Uint8Array>({
          cancel: (): void => {
            cancelled = true;
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      ),
    );
    await settle();
    expect(cancelled).toBe(true);
    expect(events).toEqual([]);
    expect(timer.armed()).toEqual([]);
    expect(sent).toHaveLength(1);
  });

  test("close cancels a pending reader and releases its lock", async () => {
    const answer = eventStream(["event: connected\ndata: {}\n\n"], undefined, true);
    answerWith(() => answer);
    const source = open();
    await nextEvent(source, "connected");
    expect(answer.body?.locked).toBe(true);
    source.close();
    await settle();
    expect(answer.body?.locked).toBe(false);
    expect(timer.armed()).toEqual([]);
  });

  test("a truncated UTF-8 sequence and unfinished event are discarded across attempts", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller): void {
        controller.enqueue(encoder.encode("id: safe\ndata: first\n\ndata: "));
        controller.enqueue(new Uint8Array([0xe7, 0x95]));
        controller.close();
      },
    });
    answerWith(() => new Response(body, { headers: { "content-type": "text/event-stream" } }));
    const source = open();
    await nextEvent(source, "error");
    answerWith((signal) => eventStream(["data: second\n\n"], signal));
    const values: string[] = [];
    source.addEventListener("message", (event) => values.push(String((event as MessageEvent).data)));
    timer.fire();
    await nextEvent(source, "error");
    expect(values).toEqual(["second"]);
    expect(header(sent[1], "last-event-id")).toBe("safe");
    source.close();
  });

  test("consecutive transient HTTP failures back off to the cap and exhaust the retry budget", async () => {
    for (let index = 0; index < 6; index += 1) {
      answerWith(() => new Response("unavailable", { status: 503 }));
    }
    const source = open();
    await nextEvent(source, "error");
    for (const delay of [3000, 6000, 12_000, 24_000, 30_000]) {
      expect(timer.armed()).toEqual([delay]);
      timer.fire();
      await nextEvent(source, "error");
    }
    expect(source.readyState).toBe(source.CLOSED);
    expect(sent).toHaveLength(6);
    expect(timer.armed()).toEqual([]);
  });

  test.each([
    ["7", 7000],
    ["999", 30_000],
    ["Wed, 15 Jun 2005 12:26:47 GMT", 7000],
    ["invalid", 1500],
    ["-1", 1500],
    ["0.5", 1500],
  ])("Retry-After %s is honored within bounds with independent jitter", async (retryAfter, expected) => {
    answerWith(() => new Response("unavailable", { status: 503, headers: { "retry-after": retryAfter } }));
    const source = new PostEventSource(URL_WITH_INPUT, {
      schedule: scheduleStep,
      random: () => 0,
      now: () => Date.UTC(2005, 5, 15, 12, 26, 40),
    });
    await nextEvent(source, "error");
    expect(timer.armed()).toEqual([expected]);
    source.close();
  });

  test("only a valid connected frame resets backoff, not 200 headers", async () => {
    answerWith(() => new Response("unavailable", { status: 503 }));
    answerWith((signal) => eventStream([], signal));
    answerWith((signal) => eventStream(["event: connected\ndata: {}\n\n"], signal));
    const source = open();
    await nextEvent(source, "error");
    expect(timer.armed()).toEqual([3000]);
    timer.fire();
    await nextEvent(source, "error");
    expect(timer.armed()).toEqual([6000]);
    timer.fire();
    await nextEvent(source, "error");
    expect(timer.armed()).toEqual([3000]);
    source.close();
  });

  test("empty IDs and no-data ID blocks commit normally, while NUL IDs are ignored", async () => {
    answerWith((signal) => eventStream(["id: 7\n\nid:\n\ndata: cleared\n\nid: kept\n\nid: bad\0id\ndata: inherited\n\n"], signal));
    const source = open();
    const seen: string[] = [];
    source.addEventListener("message", (event) => seen.push((event as MessageEvent).lastEventId));
    await nextEvent(source, "error");
    expect(seen).toEqual(["", "kept"]);
    timer.fire();
    await settle();
    expect(header(sent[1], "last-event-id")).toBe("kept");
    source.close();
  });

  test.each(["not-json", "[]", "null"])("invalid connected metadata %s is terminal", async (payload) => {
    answerWith((signal) => eventStream([`event: connected\ndata: ${payload}\n\n`], signal));
    const source = open();
    await nextEvent(source, "error");
    expect(source.readyState).toBe(source.CLOSED);
    expect(timer.armed()).toEqual([]);
    expect(sent).toHaveLength(1);
  });

  test("a cancelled deadline callback cannot close a successor attempt; a cancelled retry cannot reopen after close", async () => {
    const callbacks: (() => void)[] = [];
    const schedule = (fn: () => void, ms: number): (() => void) => {
      callbacks.push(fn);
      return scheduleStep(fn, ms);
    };
    answerWith((signal) => eventStream(["event: connected\ndata: {}\n\n"], signal));
    answerWith((signal) => eventStream(["event: connected\ndata: {}\n\n"], signal, true));
    const source = new PostEventSource(URL_WITH_INPUT, { schedule, random: () => 1 });
    await nextEvent(source, "error");
    const staleDeadline = callbacks[0];
    const reconnect = callbacks.at(-1);
    timer.fire();
    await nextEvent(source, "connected");
    staleDeadline?.();
    expect(sent[1]?.init.signal?.aborted).toBe(false);
    source.close();
    reconnect?.();
    await settle();
    expect(sent).toHaveLength(2);
    expect(timer.armed()).toEqual([]);
  });

  test("a cancelled opening deadline cannot abort the same attempt after it connected", async () => {
    const callbacks: (() => void)[] = [];
    answerWith((signal) => eventStream(["event: connected\ndata: {}\n\n"], signal, true));
    const source = new PostEventSource(URL_WITH_INPUT, {
      schedule: (fn, ms) => {
        callbacks.push(fn);
        return scheduleStep(fn, ms);
      },
    });
    await nextEvent(source, "connected");
    expect(callbacks[0]).toBeTypeOf("function");
    expect(timer.cancelled()).toContain(15_000);
    callbacks[0]?.();
    expect(sent[0]?.init.signal?.aborted).toBe(false);
    source.close();
  });

  test("opening timeout cancels and releases the old reader before any reconnect is armed", async () => {
    const cleanup = Promise.withResolvers<void>();
    let cancellationStarted = false;
    const body = new ReadableStream<Uint8Array>({
      cancel: () => {
        cancellationStarted = true;
        return cleanup.promise;
      },
    });
    answerWith(() => new Response(body, { headers: { "content-type": "text/event-stream" } }));
    const source = open();
    await nextEvent(source, "open");
    expect(body.locked).toBe(true);
    timer.fire();
    await settle();
    expect(sent[0]?.init.signal?.aborted).toBe(true);
    expect(cancellationStarted).toBe(true);
    expect(timer.armed()).toEqual([]);
    expect(sent).toHaveLength(1);
    cleanup.resolve();
    await nextEvent(source, "error");
    expect(body.locked).toBe(false);
    expect(timer.armed()).toEqual([3000]);
    timer.fire();
    await settle();
    expect(sent).toHaveLength(2);
    source.close();
  });

  test("opening has a deadline even when fetch never returns headers", async () => {
    const source = open();
    expect(timer.armed()).toEqual([15_000]);
    timer.fire();
    await settle();
    expect(sent[0]?.init.signal?.aborted).toBe(true);
    source.close();
  });

  test("opening still has a deadline after headers until the tRPC connected frame arrives", async () => {
    answerWith((signal) => eventStream([], signal, true));
    const source = open();
    await nextEvent(source, "open");
    expect(timer.armed()).toEqual([15_000]);
    timer.fire();
    await settle();
    expect(sent[0]?.init.signal?.aborted).toBe(true);
    source.close();
  });

  test.each(["eof", "eof-untracked", "http"])("one-shot %s failure is terminal, not a second generation request", async (mode) => {
    answerWith((signal) =>
      mode === "http"
        ? new Response("unavailable", { status: 503 })
        : eventStream([`event: connected\ndata: {}\n\n${mode === "eof" ? "id: 0\n" : ""}data: partial\n\n`], signal),
    );
    const source = new PostEventSource(URL_WITH_INPUT, { schedule: scheduleStep, reconnect: false });
    await nextEvent(source, "error");
    await settle();
    expect(source.readyState).toBe(source.CLOSED);
    expect(timer.armed()).toEqual([]);
    expect(sent).toHaveLength(1);
  });

  test("an uncommitted ID and partial decoder/event state do not contaminate the next attempt", async () => {
    answerWith((signal) => eventStream(["id: committed\ndata: first\n\nid: unfinished\ndata: lost\n"], signal));
    const source = open();
    await nextEvent(source, "error");
    answerWith((signal) => eventStream(["data: second\n\n"], signal));
    const second: MessageEvent[] = [];
    source.addEventListener("message", (event) => second.push(event as MessageEvent));
    timer.fire();
    await nextEvent(source, "error");
    expect(header(sent[1], "last-event-id")).toBe("committed");
    expect(second.map((event) => [event.data, event.lastEventId])).toEqual([["second", "committed"]]);
    source.close();
  });

  test("the native outer consumer cannot bypass adapter budgets with a connected inactivity instruction", async () => {
    answerWith((signal) =>
      eventStream(['event: connected\ndata: {"reconnectAfterInactivityMs":1,"feature":"fixture","nested":{"keep":true}}\n\n'], signal, true),
    );
    const source = open();
    const connected = (await nextEvent(source, "connected")) as MessageEvent;
    expect(JSON.parse(connected.data)).toEqual({ feature: "fixture", nested: { keep: true } });
    expect(timer.armed()).toEqual([45_000]);
    source.close();
  });

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
    await settle();
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
    await settle();
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
    expect(timer.cancelled()).toEqual([15_000, SERVER_DEFAULT_RETRY_MS]);
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
