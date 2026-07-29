// routeImpersonateStream — the SSE stub for `chat.impersonateStream` in Playwright CT (the `routeChatStream`
// companion). It fulfills the EventSource GET with a real `text/event-stream` body carrying a SCRIPTED
// sequence of `{ delta }` chunks in the exact tRPC SSE wire shape, so a CT drives the production path
// end-to-end: EventSource → httpSubscriptionLink → the imperative `trpcClient.chat.impersonateStream.subscribe`
// → useGuidedActions' `streamImpersonation` → the composer-draft store. Only the NETWORK is stubbed.
//
// PROGRESSIVE FILL: Playwright's `route.fulfill` sends the body WHOLE (no chunked/delayed delivery), so all
// frames in one response are dispatched before a CT can poll the DOM — the intermediate state is invisible.
// To make the accumulation OBSERVABLE, this stub stages ONE delta per EventSource CONNECT: the first response
// serves `connected + delta[0]` then closes WITHOUT a `return` frame, so the browser's EventSource
// auto-RECONNECTS (carrying `Last-Event-ID`); the Nth reconnect serves the next delta; the final connect
// serves the terminal `return`. The reconnect IS the timing gap a CT observes between deltas — modeling the
// real network's frame-by-frame arrival without needing a streaming body Playwright can't produce.
//
// Wire shape (matches route-trpc-subscription.ts, verified against @trpc/server 11.18 sse.ts): a `connected`
// frame first, then each tracked value as `data: <JSON>` + `id: <seq>`, then a terminal `return` frame that
// closes the EventSource cleanly (the stream's natural completion → the subscription's onComplete).
//
// USAGE — call routeTrpc FIRST (for the query/mutation traffic, e.g. `chat.startChat` on the draft path),
// then routeImpersonateStream. Registered last, this handler runs first and either serves the event-stream
// request or falls through (route.fallback) to routeTrpc for everything else.

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

/** The Nth CONNECT's body: `connected` + ONE scripted delta (the Nth), no `return` — so the EventSource
 *  reconnects for the next. Once every delta is served, the final connect sends `connected` + `return` (clean
 *  close → the subscription's onComplete). A connect past the script (a stray reconnect) gets a bare close. */
function connectBody(deltas: readonly string[], connectIndex: number): string {
  const frames: string[] = [sseFrame({ event: "connected", data: JSON.stringify({}) })];
  const delta = deltas[connectIndex];
  if (delta !== undefined) {
    // One delta this connect; its tracked id is the delta index (the reconnect's Last-Event-ID resume cursor).
    frames.push(sseFrame({ data: JSON.stringify({ delta }), id: String(connectIndex) }));
  } else {
    frames.push(sseFrame({ event: "return", data: "" }));
  }
  return frames.join("");
}

export interface ImpersonateStreamRecorder {
  /** How many EventSource connects were served (first subscribe + each staged reconnect). */
  readonly count: () => number;
  /** The decoded `?input=` of the FIRST subscribe (the reconnects carry the same input). */
  readonly firstInput: () => unknown;
  /** The decoded `?input=` of the most recent connect. */
  readonly lastInput: () => unknown;
}

/** Stub `chat.impersonateStream` with a scripted SSE stream that stages ONE `{ delta }` per EventSource
 *  CONNECT (see the header) — the browser auto-reconnects between deltas, giving a CT an observable gap to
 *  assert the composer grows delta-by-delta. Non-event-stream requests fall through (`route.fallback()`). */
export async function routeImpersonateStream(page: Page, deltas: readonly string[]): Promise<ImpersonateStreamRecorder> {
  const inputs: unknown[] = [];
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
    // The connect index = how many connects we've seen so far (0-based) → which delta to serve this connect.
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body: connectBody(deltas, inputs.length - 1),
    });
  });
  return {
    count: (): number => inputs.length,
    firstInput: (): unknown => inputs.at(0),
    lastInput: (): unknown => inputs.at(-1),
  };
}
