// routeAutomationStream — the SSE stub for `automation.stream` in Playwright CT (the `routeOrbSocket`
// companion, automation-design/04 §5). It fulfills the EventSource GET with a real `text/event-stream` body
// carrying a SCRIPTED sequence of `AutomationBusEvent`s in the exact tRPC SSE wire shape, so a CT drives the
// production path end-to-end: EventSource → httpSubscriptionLink → useSubscription → the chips component's
// onData. Only the NETWORK is stubbed — the component's real state + render + send path runs.
//
// Wire shape (matches route-orb-socket.ts, verified against @trpc/server 11.18 sse.ts): a `connected`
// frame first, then each tracked value as `data: <JSON>` + `id: <seq>`, then a terminal `return` frame.
//
// USAGE — call routeTrpc FIRST (for the query/mutation + `chat.send` traffic), then routeAutomationStream.
// Registered last, this handler runs first and either serves the event-stream request or falls through
// (route.fallback) to routeTrpc for everything else.

import type { AutomationBusEvent } from "@orb/contracts/automation";
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
function streamBody(events: readonly AutomationBusEvent[], includeReturn: boolean): string {
  const frames: string[] = [sseFrame({ event: "connected", data: JSON.stringify({}) })];
  for (const [i, event] of events.entries()) {
    frames.push(sseFrame({ data: JSON.stringify(event), id: String(i + 1) }));
  }
  if (includeReturn) {
    frames.push(sseFrame({ event: "return", data: "" }));
  }
  return frames.join("");
}

export interface AutomationStreamRecorder {
  /** How many EventSource subscribe requests were served. */
  readonly count: () => number;
}

/** Stub `automation.stream` with a scripted SSE body. Non-event-stream requests fall through
 *  (`route.fallback()`) to a previously-registered routeTrpc. The scripted events fire once, on the first
 *  subscribe; any reconnect gets a bare connected→return. */
export async function routeAutomationStream(page: Page, events: readonly AutomationBusEvent[]): Promise<AutomationStreamRecorder> {
  let served = 0;
  await page.route("**/api/trpc/**", async (route) => {
    const accept = route.request().headers()["accept"] ?? "";
    if (!accept.includes("text/event-stream")) {
      await route.fallback();
      return;
    }
    served += 1;
    // First subscribe → the full script; any reconnect → a clean empty close (no event replay).
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body: streamBody(served === 1 ? events : [], true),
    });
  });
  return { count: (): number => served };
}
