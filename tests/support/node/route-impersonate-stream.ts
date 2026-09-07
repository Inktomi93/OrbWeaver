// routeImpersonateStream — the SSE stub for `chat.impersonateStream` in Playwright CT (the `routeOrbSocket`
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
// Wire shape (matches route-orb-socket.ts, verified against @trpc/server 11.18 sse.ts): a `connected`
// frame first, then each tracked value as `data: <JSON>` + `id: <seq>`, then a terminal `return` frame that
// closes the EventSource cleanly (the stream's natural completion → the subscription's onComplete).
//
// TWO STUBS, two jobs: `routeImpersonateStream` (progressive fill — one delta per staged reconnect) and
// `routeImpersonateStreamOnce` (a ONE-SHOT body: deltas + one terminal end, every connect identical) for the
// zombie-subscription cases, where the connect COUNT is the assertion and a staged reconnect would be noise.
//
// USAGE — call routeTrpc FIRST (for the query/mutation traffic, e.g. `chat.startChat` on the draft path),
// then routeImpersonateStream. Registered last, this handler runs first and either serves the event-stream
// request or falls through (route.fallback) to routeTrpc for everything else.

import type { Page } from "@playwright/test";

/** One SSE frame in the tRPC shape (fields each `\n`-terminated, then a blank line dispatches it). A `retry`
 *  field re-times the browser's EventSource reconnect delay (default ~3s) — the one-shot stub sets it low so a
 *  ZOMBIE reconnect shows up inside a CT's patience instead of after three seconds. */
function sseFrame(fields: { event?: string; data: string; id?: string; retry?: number }): string {
  let frame = "";
  if (fields.event !== undefined) {
    frame += `event: ${fields.event}\n`;
  }
  if (fields.retry !== undefined) {
    frame += `retry: ${fields.retry}\n`;
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
function connectBody(deltas: readonly string[], connectIndex: number, retryMs: number | undefined): string {
  const frames: string[] = [sseFrame({ event: "connected", data: JSON.stringify({}), ...(retryMs === undefined ? {} : { retry: retryMs }) })];
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
 *  assert the composer grows delta-by-delta. Non-event-stream requests fall through (`route.fallback()`).
 *
 *  `retryMs` pins the browser's reconnect delay (default: the browser's own ~3s), which makes the INTER-DELTA
 *  GAP a known quantity — the window in which the stream is provably still LIVE. A CT that acts mid-stream
 *  (the IMP-2 Stop) needs both halves of that: enough time to act, and a bound short enough that "no
 *  reconnect arrived" is a real observation rather than an impatient one. */
export async function routeImpersonateStream(page: Page, deltas: readonly string[], retryMs?: number): Promise<ImpersonateStreamRecorder> {
  const inputs: unknown[] = [];
  await page.route("**/api/trpc/**", async (route) => {
    const req = route.request();
    const accept = req.headers()["accept"] ?? "";
    // BOTH halves (#1491): the right CONTENT TYPE and the right PROCEDURE. Matching on `accept` alone made
    // this stub answer EVERY tRPC subscription in the CT — a story that also opens `stream.connect` got
    // impersonation deltas on its socket, and a CT could pass because of the over-broad match rather than
    // because of the app.
    if (!(accept.includes("text/event-stream") && isImpersonateStreamRequest(req))) {
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
      body: connectBody(deltas, inputs.length - 1, retryMs),
    });
  });
  return {
    count: (): number => inputs.length,
    firstInput: (): unknown => inputs.at(0),
    lastInput: (): unknown => inputs.at(-1),
  };
}

/** The reconnect delay the one-shot stub pins (ms) — a zombie's SECOND connect lands well inside
 *  {@link ZOMBIE_WATCH_MS}, so "count is still 1" is a real observation, not an impatient one. */
const ONE_SHOT_RETRY_MS = 200;

/** How long a CT watches for a zombie reconnect after the stream settled (ms) — several
 *  {@link ONE_SHOT_RETRY_MS} windows, so "nothing re-opened" is a real observation. */
export const ZOMBIE_WATCH_MS = 900;

/** Matches a `chat.impersonateStream` SSE connect — the request a zombie subscription re-fires. */
export function isImpersonateStreamRequest(request: { url: () => string }): boolean {
  return request.url().includes("chat.impersonateStream");
}

/** How a one-shot stream ENDS:
 *  • `return` — the clean terminal frame (the generator finished).
 *  • `error-frame` — the typed `__subscriptionError` frame `withSubscriptionErrors` emits for a DomainError,
 *    followed by the `return` the producer sends when the generator then finishes.
 *  • `server-error` — the `serialized-error` event a NON-domain throw becomes (a raw `ProviderError` → tRPC
 *    INTERNAL_SERVER_ERROR), with NO `return`: the response just ends. This is the DEAD-ENGINE shape, and the
 *    reason it is nasty is that INTERNAL_SERVER_ERROR is in tRPC's `retryableRpcCodes` — `httpSubscriptionLink`
 *    reports "connecting" and lets EventSource re-open the stream forever, firing NO client callback. */
const ONE_SHOT_ENDS = ["return", "error-frame", "server-error"] as const;
type OneShotEnd = (typeof ONE_SHOT_ENDS)[number];

interface OneShotScript {
  /** Text deltas served before the terminal frame (all in ONE response — no staged reconnects). */
  readonly deltas?: readonly string[];
  readonly end: OneShotEnd;
  /** The message the `error-frame` / `server-error` end carries. */
  readonly message?: string;
}

/** The `serialized-error` payload shape a tRPC SSE producer writes for a thrown non-domain error: the
 *  standard error shape (`code` is the NUMERIC jsonrpc code the link matches against `retryableRpcCodes`;
 *  -32603 = INTERNAL_SERVER_ERROR, and `data` is what makes it a server-shaped TRPCClientError client-side). */
function serializedError(message: string): string {
  return JSON.stringify({
    message,
    code: -32_603,
    data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500, path: "chat.impersonateStream" },
  });
}

function terminalFrames(script: OneShotScript): readonly string[] {
  const message = script.message ?? "impersonation failed";
  if (script.end === "server-error") {
    return [sseFrame({ event: "serialized-error", data: serializedError(message) })];
  }
  const frames: string[] = [];
  if (script.end === "error-frame") {
    // Mirrors withSubscriptionErrors: the typed frame is a tracked yield with the never-resumable id, then the
    // generator returns → the producer appends `return`.
    frames.push(sseFrame({ data: JSON.stringify({ __subscriptionError: true, code: "SERVICE_UNAVAILABLE", message }), id: "__error__" }));
  }
  frames.push(sseFrame({ event: "return", data: "" }));
  return frames;
}

/**
 * Stub `chat.impersonateStream` as a ONE-SHOT stream: every connect serves the SAME scripted body (deltas +
 * one terminal end), so `count()` reads directly as "how many times did the client open this subscription".
 * The sibling {@link routeImpersonateStream} stages one delta per connect to make progressive fill observable
 * — that fiction is useless here, because the thing under test IS the connect count.
 */
export async function routeImpersonateStreamOnce(page: Page, script: OneShotScript): Promise<ImpersonateStreamRecorder> {
  const inputs: unknown[] = [];
  const body = [
    sseFrame({ event: "connected", data: JSON.stringify({}), retry: ONE_SHOT_RETRY_MS }),
    ...(script.deltas ?? []).map((delta, index) => sseFrame({ data: JSON.stringify({ delta }), id: String(index) })),
    ...terminalFrames(script),
  ].join("");
  await page.route("**/api/trpc/**", async (route) => {
    const req = route.request();
    // Procedure-matched, exactly like the staged stub above (#1491).
    if (!((req.headers()["accept"] ?? "").includes("text/event-stream") && isImpersonateStreamRequest(req))) {
      await route.fallback();
      return;
    }
    const inputParam = new URL(req.url()).searchParams.get("input");
    inputs.push(inputParam === null ? undefined : JSON.parse(inputParam));
    await route.fulfill({ status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-cache" }, body });
  });
  return {
    count: (): number => inputs.length,
    firstInput: (): unknown => inputs.at(0),
    lastInput: (): unknown => inputs.at(-1),
  };
}
