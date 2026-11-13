// A raw consumer of the MULTIPLEXED socket, as a SPECIFIC actor — the wire instrument for proving the
// per-viewer live-stream projection (the §3.6 reasoning-channel host-only cut). Since SSE-1 S2 a chat's
// room-public events do NOT have a procedure of their own: a tab holds ONE `stream.connect` EventSource and
// ATTACHES rooms to it, so this instrument does what a browser does — POST `stream.attach` for the `chat`
// room, then open `stream.connect` and filter that room's frames. The browser opens it as a JSON POST
// (`PostEventSource`); this instrument keeps the GET form, which the server accepts only with the CSRF header.
//
// The tRPC wire (verified empirically): a GET subscription is `GET /api/trpc/stream.connect?input=<encodeURI…>`
// (NON-batched — a batched subscription 400s "Cannot batch subscription calls") with
// `Accept: text/event-stream`; a mutation is `POST /api/trpc/stream.attach?batch=1` with an index-keyed body.
// Cookies flow same-origin. The ATTACH is an ordinary mutation, so a cookie actor's `x-orb-csrf` header
// (already in `ActorClient.headers`) carries it through the CSRF gate, and the GET connect sends the header
// on every path because the mount refuses a header-less GET subscription (`packages/server/src/entry/app.ts`). Each SSE `data:` line is the yielded FRAME; the durable cursor rides `frame.seq` (the socket's
// own `id:` line is a per-socket ORDINAL, deliberately not a cursor — spec §3.3).
//
// We drive the REAL `chat` ROOM SOURCE (`transport/trpc/stream/sources/chat.ts` — the same generator that
// used to be `chat.streamMessages`), the exact path a real member's browser bus rides — so what this
// consumer receives IS what a member receives, byte for byte.
//
// THE VERDICT (#1505): a collection says HOW it stopped. It used to return a bare array whether `until` held,
// the timer fired or the server closed the socket, and it dropped unreadable frames silently — so a spec's
// absence assertion (`not.toContain(<the hidden truth>)`) passed on a stream that delivered nothing. Values
// that feed an assertion are read through `requireSatisfied`, which refuses every other verdict by name.

import { CSRF_HEADER } from "@orb/contracts/identity";
import type { StreamFrameFor } from "@orb/contracts/stream";
import type { ChatId } from "@orb/kit/ids";
import { pageObject, pageString } from "@orb/tooling/floor/browser/page-validate";

/** The observed cursor and unvalidated event; collection retains the original parsed frame object. */
export type StreamValue = Pick<StreamFrameFor<"chat">, "seq"> & { readonly event: unknown };

/** Read the event only when a caller needs its fields; raw collection does not certify a bus event. */
export function readStreamEvent(value: StreamValue): Record<string, unknown> {
  const event = pageObject(value.event, "chat SSE event");
  pageString(event["type"], 'chat SSE event field "type"');
  return event;
}

/** This frame's visible text, when it is a text delta. A committed view or a reasoning delta is not delivered prose. */
export function textDeltaOf(value: StreamValue): string | undefined {
  const event = readStreamEvent(value);
  if (event["type"] !== "delta") {
    return undefined;
  }
  const delta = pageObject(event["delta"], "SSE delta");
  return pageString(delta["kind"], "SSE delta kind") === "text" ? pageString(delta["text"], "SSE delta text") : undefined;
}

/** The text deltas a viewer received, joined. Replay may split or coalesce them, so a caller reads text, never a count. */
export function deliveredText(values: readonly StreamValue[]): string {
  return values.flatMap((value) => textDeltaOf(value) ?? []).join("");
}

function hasObservedValue(value: object): value is StreamValue {
  return "seq" in value && typeof value.seq === "number" && "event" in value && value.event !== undefined;
}

/** How a collection stopped. `satisfied` is the only arm under which the values are evidence: `timed-out` (the
 *  timer fired first) and `stream-ended` (the server closed the socket first) both mean `until` never held. */
const CHAT_ROOM_COLLECTION_OUTCOMES = ["satisfied", "timed-out", "stream-ended"] as const;
type ChatRoomCollectionOutcome = (typeof CHAT_ROOM_COLLECTION_OUTCOMES)[number];

/** The collector's verdict. `malformedFrames` counts frames whose `data:` payload the instrument could not read
 *  (not JSON, not an object, or a frame of THIS room without a numeric `seq` and an `event`). Control frames and
 *  other rooms' frames are expected traffic and are not counted. */
export interface ChatRoomCollection {
  readonly values: readonly StreamValue[];
  readonly outcome: ChatRoomCollectionOutcome;
  readonly malformedFrames: number;
}

/** Attach the `chat` room for `chatId` on a fresh per-caller socket, then collect that room's frames as
 *  `headers` identify the caller, until `until` is satisfied (a committed row lands / N events), the server
 *  closes the stream, OR `timeoutMs` elapses — and say which (`outcome`). `sinceSeq` is the replay request
 *  (`0` replays the whole durable log — the client's draft→committed seed); omit for live-only. The connection
 *  is aborted once the predicate fires (or on timeout), so this never hangs. */
export async function collectChatRoomFrames(args: {
  readonly baseUrl: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly chatId: ChatId;
  readonly until: (values: readonly StreamValue[]) => boolean;
  readonly timeoutMs: number;
  readonly sinceSeq?: number;
  /** Runs at this room's `attached` frame: its pump has started, so a turn fired now reaches this socket. */
  readonly onLive?: () => void;
}): Promise<ChatRoomCollection> {
  const { baseUrl, headers, chatId, until, timeoutMs, sinceSeq, onLive } = args;
  // One socket per collect call — this instrument IS a tab, and a distinct id keeps two concurrent viewers
  // (host + member) on genuinely independent cells. Random by design: the id keys a server cell that outlives a
  // restarted worker, so a seeded counter that restarts could attach to a cell another worker still holds.
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
  const tally: FrameTally = { values: [], malformed: 0, onLive };
  // The timer is the only abort source before `finally`, so an aborted read that reaches the catch below
  // leaves this default standing.
  let outcome: ChatRoomCollectionOutcome = "timed-out";
  try {
    const res = await fetch(url, { headers: { ...headers, accept: "text/event-stream", [CSRF_HEADER]: "1" }, signal: controller.signal });
    if (!res.ok || res.body === null) {
      throw new Error(`collectChatRoomFrames: connect failed (HTTP ${res.status})`);
    }
    outcome = await pumpStream(res.body.getReader(), tally, until, chatId);
  } catch (err) {
    // An abort is the timer's `timed-out` verdict, already recorded; anything else is a real failure.
    if (!controller.signal.aborted) {
      throw err;
    }
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
  return { values: tally.values, outcome, malformedFrames: tally.malformed };
}

/** A collection whose socket is already live, so the caller can fire a turn at once. A failed connect rejects here. */
export async function openChatRoomCollection(
  args: Omit<Parameters<typeof collectChatRoomFrames>[0], "onLive">,
): Promise<{ readonly collection: Promise<ChatRoomCollection> }> {
  const live = Promise.withResolvers<void>();
  const collection = collectChatRoomFrames({ ...args, onLive: live.resolve });
  await Promise.race([live.promise, collection]);
  return { collection };
}

/** The values of a collection that is EVIDENCE — `until` held and every frame was readable — else a thrown
 *  error naming `label`, the verdict and what was collected. Every spec reading a collection's values goes
 *  through this, and an ABSENCE assertion above all: a timed-out empty collection passes one vacuously. */
export function requireSatisfied(collection: ChatRoomCollection, label: string): readonly StreamValue[] {
  if (collection.outcome !== "satisfied" || collection.malformedFrames > 0) {
    throw new Error(
      `collectChatRoomFrames(${label}): outcome ${collection.outcome}, ${String(collection.values.length)} values, ${String(collection.malformedFrames)} malformed frames — the collection is not evidence`,
    );
  }
  return collection.values;
}

/** The accumulator one pump fills: this room's parsed values and the unreadable-frame count. */
interface FrameTally {
  readonly values: StreamValue[];
  malformed: number;
  readonly onLive: (() => void) | undefined;
}

/** Read SSE chunks, record every frame in `tally`, and STOP once `until(values)` holds (`satisfied`) or the
 *  stream ends (`stream-ended`). Frames are blank-line-separated; a chunk may carry a partial frame, buffered
 *  across reads. */
async function pumpStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  tally: FrameTally,
  until: (values: readonly StreamValue[]) => boolean,
  chatId: ChatId,
): Promise<ChatRoomCollectionOutcome> {
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return "stream-ended";
    }
    buffer += decoder.decode(value, { stream: true });
    buffer = drainFrames(buffer, tally, chatId);
    if (until(tally.values)) {
      return "satisfied";
    }
  }
}

/** Split every COMPLETE frame (up to a blank line) out of `buffer`, record its reading in `tally`, and return
 *  the trailing incomplete remainder. */
function drainFrames(buffer: string, tally: FrameTally, chatId: ChatId): string {
  let rest = buffer;
  let sep = rest.indexOf("\n\n");
  while (sep !== -1) {
    const reading = readFrame(rest.slice(0, sep), chatId);
    if (reading.kind === "value") {
      tally.values.push(reading.value);
    } else if (reading.kind === "malformed") {
      tally.malformed += 1;
    } else if (reading.kind === "attached") {
      tally.onLive?.();
    }
    rest = rest.slice(sep + 2);
    sep = rest.indexOf("\n\n");
  }
  return rest;
}

/** What one SSE frame was: THIS room's data frame, its `attached` notice, expected traffic to skip, or a frame nobody can read. */
type FrameReading =
  | { readonly kind: "value"; readonly value: StreamValue }
  | { readonly kind: "skip" }
  | { readonly kind: "malformed" }
  | { readonly kind: "attached" };

const SKIP: FrameReading = { kind: "skip" };
const MALFORMED: FrameReading = { kind: "malformed" };
const ATTACHED: FrameReading = { kind: "attached" };

/** Is this the control frame that says the pump for `chatId` started on this socket? */
function isRoomAttached(payload: object, chatId: ChatId): boolean {
  return (
    "channel" in payload &&
    payload.channel === "control" &&
    "type" in payload &&
    payload.type === "attached" &&
    "ref" in payload &&
    typeof payload.ref === "object" &&
    payload.ref !== null &&
    "chatId" in payload.ref &&
    payload.ref.chatId === chatId
  );
}

/** Read one SSE frame. tRPC's `httpSubscriptionLink` writes the YIELDED VALUE directly as the `data:` JSON
 *  (NOT wrapped in `{data:…}`), with the per-socket ordinal on a following `id:` line. A frame with no `data:`
 *  line (a ping), a control frame (the `event: connected` handshake's `data: {}`, a `channel:"control"`
 *  lifecycle frame) and another room's frame are skipped; unparseable data, or a frame of THIS room without its
 *  `event` or a numeric `seq`, is malformed. */
function readFrame(frame: string, chatId: ChatId): FrameReading {
  let dataLine: string | null = null;
  for (const line of frame.split("\n")) {
    if (line.startsWith("data:")) {
      dataLine = line.slice(5).trim();
    }
  }
  if (dataLine === null) {
    return SKIP;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(dataLine);
  } catch {
    return MALFORMED;
  }
  if (typeof payload !== "object" || payload === null) {
    return MALFORMED;
  }
  if (isRoomAttached(payload, chatId)) {
    return ATTACHED;
  }
  if (!("channel" in payload) || payload.channel !== "chat" || !("chatId" in payload) || payload.chatId !== chatId) {
    return SKIP;
  }
  if (!hasObservedValue(payload)) {
    return MALFORMED;
  }
  return { kind: "value", value: payload };
}
