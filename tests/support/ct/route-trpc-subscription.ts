// routeChatStream — the SSE stub for `chat.streamMessages` in Playwright CT (the companion routeTrpc
// (route-trpc.ts) explicitly scopes subscriptions OUT and reserves this helper "for the chat-surface
// lane"). It fulfills the EventSource GET with a real `text/event-stream` body carrying a SCRIPTED
// sequence of `ChatBusEvent`s in the exact tRPC SSE wire shape, so a CT drives the production path
// end-to-end: EventSource → httpSubscriptionLink → useChatBus → applyChatBusEvent → the chat-stream
// store + the invalidation refetch. No mocking of the reducer or the store — only the network.
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

/** Build the full stream body: connected → each event (seq from 1) → return (clean close). */
function streamBody(events: readonly ChatBusEvent[], includeReturn: boolean): string {
  const frames: string[] = [sseFrame({ event: "connected", data: JSON.stringify({}) })];
  for (const [i, event] of events.entries()) {
    frames.push(sseFrame({ data: JSON.stringify(event), id: String(i + 1) }));
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
  /** The ordered `ChatBusEvent`s to emit after `connected` (seq assigned 1…N). */
  readonly events: readonly ChatBusEvent[];
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
    const body = streamBody(inputs.length === 1 ? opts.events : [], closeStream);
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
