// routeChatStream — the SSE stub for `chat.streamMessages` in Playwright CT (the companion routeTrpc
// (route-trpc.ts) explicitly scopes subscriptions OUT and reserves this helper "for the chat-surface
// lane"). It fulfills the EventSource GET with a real `text/event-stream` body carrying a SCRIPTED
// sequence of `ChatBusEvent`s in the exact tRPC SSE wire shape, so a CT drives the production path
// end-to-end: EventSource → httpSubscriptionLink → useChatBus → applyChatBusEvent → the chat-stream
// store + the invalidation refetch. No mocking of the reducer or the store — only the network.
//
// The `routeUserStream` sibling that lived here went with its procedure: SSE-1 folded
// `sessions.streamUserEvents` into the `user` ROOM of the multiplexed socket, so the user bus is stubbed by
// `route-orb-socket.ts` (which speaks FRAMES, and records attach/detach). `chat.streamMessages` folds at
// S2 and this stub goes with it.
//
// Wire shape (verified against @trpc/server 11.18 unstable-core sse.ts):
//   • a `connected` frame first: `event: connected` + `data: <json client opts>`;
//   • each tracked value: `data: <JSON.stringify(event)>` + `id: <seq>` (default "message" event);
//   • a terminal `return` frame closes the EventSource (tRPC calls eventSource.close() — no reconnect).
// The client re-wraps a data frame as `{ id, data: event }`; useChatBus reads `envelope.data`.
//
// USAGE — call routeTrpc FIRST (for the query/mutation traffic), then routeChatStream. Because it is
// registered last, this handler runs first and either serves the event-stream request or falls through
// (route.fallback) to routeTrpc for everything else. Pass the scripted turn events via the options.
//
// It matches EVERY tRPC event-stream request (the accept header is the only discriminator the stub needs),
// so a story mounts exactly ONE stream per test — never a chat stream and the orb socket together.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { Page } from "@playwright/test";

/** One SSE frame in the tRPC shape (fields each `\n`-terminated, then a blank line dispatches it). */
function sseFrame(fields: { event?: string; data: string; id?: string }): string {
  let frame = "";
  if (fields.event !== undefined) {
    frame += `event: ${fields.event}\n`;
  }
  frame += `data: ${fields.data}\n`;
  if (fields.id !== undefined) {
    frame += `id: ${fields.id}\n`;
  }
  return `${frame}\n`;
}

/** One scripted stream entry: a bare `ChatBusEvent` (id auto-assigned `String(i+1)`), or an event paired
 *  with an EXPLICIT tracked `id` — needed to reproduce the transport's attach synthetics
 *  (`chatOpened`/`historyTruncated`), which carry the NON-advancing resume cursor as their id
 *  (`String(resumeSeq ?? 0)`, routers/chat.ts), not a fresh durable seq. */
export type ScriptedStreamEntry = ChatBusEvent | { readonly event: ChatBusEvent; readonly id: string };

function entryOf(entry: ScriptedStreamEntry, i: number): TrackedEntry {
  return "event" in entry ? { event: entry.event, id: entry.id } : { event: entry, id: String(i + 1) };
}

/** One already-resolved frame's payload: the bus event + the tracked id it is stamped with, if any.
 *  `id: undefined` is the UNTRACKED shape — the client hands `onData` the raw yielded value. A stamped id
 *  makes the client re-wrap it as `{ id, data }`, which is what a `tracked()` router (the chat bus) yields
 *  and what a plain `AsyncGenerator<T>` router (`sessions.streamUserEvents`) must NOT get. */
interface TrackedEntry {
  readonly event: unknown;
  readonly id?: string;
}

/** Build the full stream body: connected → each event → optionally return (a clean, no-reconnect close). */
function streamBody(entries: readonly TrackedEntry[], includeReturn: boolean): string {
  const frames: string[] = [sseFrame({ event: "connected", data: JSON.stringify({}) })];
  for (const { event, id } of entries) {
    // `exactOptionalPropertyTypes`: an UNTRACKED entry must OMIT `id`, never pass it as `undefined`.
    frames.push(sseFrame(id === undefined ? { data: JSON.stringify(event) } : { data: JSON.stringify(event), id }));
  }
  if (includeReturn) {
    frames.push(sseFrame({ event: "return", data: "" }));
  }
  return frames.join("");
}

export interface ChatStreamRecorder {
  /** How many EventSource subscribe requests were served. */
  readonly count: () => number;
  /** The decoded `?input=` of the most recent subscribe (e.g. `{ chatId, lastEventId }`). */
  readonly lastInput: () => unknown;
}

export interface RouteChatStreamOptions {
  /** The ordered entries to emit after `connected` — a bare `ChatBusEvent` (seq auto-assigned 1…N) or an
   *  `{ event, id }` pair to stamp an explicit tracked id (the attach-synthetic non-advancing cursor). */
  readonly events: readonly ScriptedStreamEntry[];
  /** Emit the terminal `return` frame so the EventSource closes cleanly. @defaultValue true */
  readonly closeStream?: boolean;
}

/**
 * Stub `chat.streamMessages` with a scripted SSE body. Non-event-stream requests fall through
 * (`route.fallback()`) to a previously-registered routeTrpc. The scripted events fire once, on the
 * first subscribe; any reconnect gets a bare connected→return (no replay).
 */
export async function routeChatStream(page: Page, opts: RouteChatStreamOptions): Promise<ChatStreamRecorder> {
  const inputs: unknown[] = [];
  const closeStream = opts.closeStream ?? true;

  await page.route("**/api/trpc/**", async (route) => {
    const req = route.request();
    const accept = req.headers()["accept"] ?? "";
    if (!accept.includes("text/event-stream")) {
      await route.fallback();
      return;
    }
    const url = new URL(req.url());
    const inputParam = url.searchParams.get("input");
    inputs.push(inputParam === null ? undefined : JSON.parse(inputParam));

    // First subscribe → the full script; any reconnect → a clean empty close (no event replay).
    const body = streamBody(inputs.length === 1 ? opts.events.map(entryOf) : [], closeStream);
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body,
    });
  });

  return {
    count: (): number => inputs.length,
    lastInput: (): unknown => inputs.at(-1),
  };
}
