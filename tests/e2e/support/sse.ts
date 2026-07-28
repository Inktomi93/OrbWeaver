// A raw SSE consumer for a tRPC subscription, as a SPECIFIC actor — the wire instrument for proving the
// per-viewer live-stream projection (the §3.6 reasoning-channel host-only cut). tRPC subscriptions ride SSE
// via `httpSubscriptionLink` (a GET with `Accept: text/event-stream`); cookies flow same-origin and
// subscriptions are CSRF-exempt by design, so an actor's cookie/JWT header is all that's needed. The tRPC
// wire (verified empirically): `GET /api/trpc/<proc>?input=<encodeURIComponent(JSON.stringify(input))>`
// (NON-batched — a batched subscription 400s "Cannot batch subscription calls"); resume via the
// `Last-Event-ID` header. Each SSE `data:` line is a tRPC envelope whose `.data` is the yielded value
// (`{ id?, data: <ChatBusEvent> }` for a value message).
//
// We drive the REAL `chat.streamMessages` path (chatEventStream → resolveLiveYield), the exact stream a real
// member's browser bus subscribes — so what this consumer receives IS what a member receives, byte for byte.

import type { ChatBusEventLite } from "./sse-types";

/** One collected stream value — the tRPC envelope `id` (the durable `seq` cursor) + the yielded event. */
export interface StreamValue {
  readonly id: string | null;
  readonly event: ChatBusEventLite;
}

/** Collect `chat.streamMessages` values for `chatId` as `headers` identify the caller, until `predicate` is
 *  satisfied (a committed row lands / N events) OR `timeoutMs` elapses. Returns every value seen. A resume
 *  `lastEventId` seeds the durable replay (the `Last-Event-ID` header) — pass "0" to replay the whole log
 *  (the client's first-connect seed), or omit for live-only. The connection is aborted once the predicate
 *  fires (or on timeout), so this never hangs. */
export async function collectChatStream(args: {
  readonly baseUrl: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly chatId: string;
  readonly until: (values: readonly StreamValue[]) => boolean;
  readonly timeoutMs: number;
  readonly lastEventId?: string;
}): Promise<readonly StreamValue[]> {
  const { baseUrl, headers, chatId, until, timeoutMs, lastEventId } = args;
  const input = encodeURIComponent(JSON.stringify({ chatId, lastEventId: lastEventId ?? null }));
  const url = `${baseUrl}/api/trpc/chat.streamMessages?input=${input}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const requestHeaders: Record<string, string> = { ...headers, accept: "text/event-stream" };
  if (lastEventId !== undefined) {
    requestHeaders["last-event-id"] = lastEventId;
  }

  const values: StreamValue[] = [];
  try {
    const res = await fetch(url, { headers: requestHeaders, signal: controller.signal });
    if (!res.ok || res.body === null) {
      throw new Error(`collectChatStream: subscribe failed (HTTP ${res.status})`);
    }
    await pumpStream(res.body.getReader(), values, until);
  } catch (err) {
    // An abort (predicate satisfied / timeout) is the normal stop — not an error unless we collected nothing.
    if (!controller.signal.aborted) {
      throw err;
    }
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
  return values;
}

/** Read SSE chunks, append every parsed value frame to `sink`, and STOP once `until(sink)` holds (or the
 *  stream ends). Frames are blank-line-separated; a chunk may carry a partial frame, buffered across reads. */
async function pumpStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  sink: StreamValue[],
  until: (values: readonly StreamValue[]) => boolean,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: SSE frames arrive sequentially — each read awaits the next network chunk by design.
    const { done, value } = await reader.read();
    if (done) {
      return;
    }
    buffer += decoder.decode(value, { stream: true });
    buffer = drainFrames(buffer, sink);
    if (until(sink)) {
      return;
    }
  }
}

/** Split every COMPLETE frame (up to a blank line) out of `buffer`, push its parsed value to `sink`, and
 *  return the trailing incomplete remainder. */
function drainFrames(buffer: string, sink: StreamValue[]): string {
  let rest = buffer;
  let sep = rest.indexOf("\n\n");
  while (sep !== -1) {
    const parsed = parseFrame(rest.slice(0, sep));
    if (parsed !== null) {
      sink.push(parsed);
    }
    rest = rest.slice(sep + 2);
    sep = rest.indexOf("\n\n");
  }
  return rest;
}

/** Parse one SSE frame into a StreamValue, or null for a non-value frame. tRPC's `httpSubscriptionLink`
 *  writes the YIELDED VALUE directly as the `data:` JSON (NOT wrapped in `{data:…}`), with the durable `seq`
 *  on a following `id:` line (verified against the live wire). A control frame — the `event: connected`
 *  handshake (`data: {}`) or a ping — has no `type`, so it is skipped. */
function parseFrame(frame: string): StreamValue | null {
  let id: string | null = null;
  let dataLine: string | null = null;
  for (const line of frame.split("\n")) {
    if (line.startsWith("id:")) {
      id = line.slice(3).trim();
    } else if (line.startsWith("data:")) {
      dataLine = line.slice(5).trim();
    }
  }
  if (dataLine === null) {
    return null;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(dataLine);
  } catch {
    return null;
  }
  // A value frame IS the ChatBusEvent (has a `type`); the connect handshake (`data: {}`) / pings have none.
  if (typeof payload !== "object" || payload === null || typeof (payload as { type?: unknown }).type !== "string") {
    return null;
  }
  return { id, event: payload as ChatBusEventLite };
}
