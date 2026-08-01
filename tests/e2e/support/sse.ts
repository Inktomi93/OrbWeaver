// A raw consumer of the MULTIPLEXED socket, as a SPECIFIC actor — the wire instrument for proving the
// per-viewer live-stream projection (the §3.6 reasoning-channel host-only cut). Since SSE-1 S2 a chat's
// room-public events do NOT have a procedure of their own: a tab holds ONE `stream.connect` EventSource and
// ATTACHES rooms to it, so this instrument does exactly what a browser does — POST `stream.attach` for the
// `chat` room, then GET `stream.connect` and filter that room's frames.
//
// The tRPC wire (verified empirically): a subscription is `GET /api/trpc/stream.connect?input=<encodeURI…>`
// (NON-batched — a batched subscription 400s "Cannot batch subscription calls") with
// `Accept: text/event-stream`; a mutation is `POST /api/trpc/stream.attach?batch=1` with an index-keyed body.
// Cookies flow same-origin; subscriptions are CSRF-exempt by design, but the ATTACH is an ordinary mutation,
// so a cookie actor's `x-orb-csrf` header (already in `ActorClient.headers`) is what carries it through the
// CSRF gate. Each SSE `data:` line is the yielded FRAME; the durable cursor rides `frame.seq` (the socket's
// own `id:` line is a per-socket ORDINAL, deliberately not a cursor — spec §3.3).
//
// We drive the REAL `chat` ROOM SOURCE (`transport/trpc/stream/sources/chat.ts` — the same generator that
// used to be `chat.streamMessages`), the exact path a real member's browser bus rides — so what this
// consumer receives IS what a member receives, byte for byte.

import type { ChatBusEventLite } from "./sse-types";

/** One collected room value — the durable `seq` cursor carried INSIDE the frame + the yielded event. */
export interface StreamValue {
  readonly seq: number;
  readonly event: ChatBusEventLite;
}

/** One `chat` frame off the socket (the wire subset this instrument reads — declared locally, the
 *  e2e-support import-free-of-package-trees rule). */
interface ChatFrame {
  readonly channel: string;
  readonly chatId?: string;
  readonly seq?: number;
  readonly event?: ChatBusEventLite;
}

/** Attach the `chat` room for `chatId` on a fresh per-caller socket, then collect that room's frames as
 *  `headers` identify the caller, until `predicate` is satisfied (a committed row lands / N events) OR
 *  `timeoutMs` elapses. Returns every value seen. `sinceSeq` is the replay request (`0` replays the whole
 *  durable log — the client's draft→committed seed); omit for live-only. The connection is aborted once the
 *  predicate fires (or on timeout), so this never hangs. */
export async function collectChatRoomFrames(args: {
  readonly baseUrl: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly chatId: string;
  readonly until: (values: readonly StreamValue[]) => boolean;
  readonly timeoutMs: number;
  readonly sinceSeq?: number;
}): Promise<readonly StreamValue[]> {
  const { baseUrl, headers, chatId, until, timeoutMs, sinceSeq } = args;
  // One socket per collect call — this instrument IS a tab, and a distinct id keeps two concurrent viewers
  // (host + member) on genuinely independent cells.
  const socketId = globalThis.crypto.randomUUID();
  const ref = { channel: "chat", chatId };

  const attachRes = await fetch(`${baseUrl}/api/trpc/stream.attach?batch=1`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ 0: { socketId, ref, ...(sinceSeq === undefined ? {} : { sinceSeq }) } }),
  });
  if (!attachRes.ok) {
    throw new Error(`collectChatRoomFrames: stream.attach failed (HTTP ${attachRes.status}): ${await attachRes.text()}`);
  }

  const input = encodeURIComponent(JSON.stringify({ socketId }));
  const url = `${baseUrl}/api/trpc/stream.connect?input=${input}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const values: StreamValue[] = [];
  try {
    const res = await fetch(url, { headers: { ...headers, accept: "text/event-stream" }, signal: controller.signal });
    if (!res.ok || res.body === null) {
      throw new Error(`collectChatRoomFrames: connect failed (HTTP ${res.status})`);
    }
    await pumpStream(res.body.getReader(), values, until, chatId);
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

/** Read SSE chunks, append every parsed frame for `chatId` to `sink`, and STOP once `until(sink)` holds (or
 *  the stream ends). Frames are blank-line-separated; a chunk may carry a partial frame, buffered across
 *  reads. Control frames (`attached` / `roomLagged` / …) and other rooms' frames are skipped. */
async function pumpStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  sink: StreamValue[],
  until: (values: readonly StreamValue[]) => boolean,
  chatId: string,
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
    buffer = drainFrames(buffer, sink, chatId);
    if (until(sink)) {
      return;
    }
  }
}

/** Split every COMPLETE frame (up to a blank line) out of `buffer`, push its parsed value to `sink`, and
 *  return the trailing incomplete remainder. */
function drainFrames(buffer: string, sink: StreamValue[], chatId: string): string {
  let rest = buffer;
  let sep = rest.indexOf("\n\n");
  while (sep !== -1) {
    const parsed = parseFrame(rest.slice(0, sep), chatId);
    if (parsed !== null) {
      sink.push(parsed);
    }
    rest = rest.slice(sep + 2);
    sep = rest.indexOf("\n\n");
  }
  return rest;
}

/** Parse one SSE frame into a StreamValue, or null for anything that is not THIS room's data frame. tRPC's
 *  `httpSubscriptionLink` writes the YIELDED VALUE directly as the `data:` JSON (NOT wrapped in `{data:…}`),
 *  with the per-socket ordinal on a following `id:` line. A control frame — the `event: connected`
 *  handshake (`data: {}`), a ping, or a `channel:"control"` lifecycle frame — carries no room event. */
function parseFrame(frame: string, chatId: string): StreamValue | null {
  let dataLine: string | null = null;
  for (const line of frame.split("\n")) {
    if (line.startsWith("data:")) {
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
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const parsed = payload as ChatFrame;
  if (parsed.channel !== "chat" || parsed.chatId !== chatId || parsed.event === undefined || typeof parsed.seq !== "number") {
    return null;
  }
  return { seq: parsed.seq, event: parsed.event };
}
