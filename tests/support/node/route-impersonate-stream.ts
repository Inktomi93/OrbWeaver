// routeImpersonateStream — the SSE stub for `chat.impersonateStream` in Playwright CT (the `routeOrbSocket`
// companion). It fulfills the subscription POST with a real `text/event-stream` body carrying a SCRIPTED
// sequence of `{ delta }` chunks in the exact tRPC SSE wire shape, so a CT drives the production path
// end-to-end: EventSource → httpSubscriptionLink → the imperative `trpcClient.chat.impersonateStream.subscribe`
// → useGuidedActions' `streamImpersonation` → the composer-draft store. Only the NETWORK is stubbed.
//
// Progressive fill uses a real local chunked response: releaseNext sends another delta on the SAME
// connection. An impersonation is not resumable, so reconnecting between deltas would model another generation.
//
// Wire shape (matches route-orb-socket.ts, verified against @trpc/server 11.18 sse.ts): a `connected`
// frame first, then each tracked value as `data: <JSON>` + `id: <seq>`, then a terminal `return` frame that
// closes the EventSource cleanly (the stream's natural completion → the subscription's onComplete).
//
// TWO STUBS, two jobs: `routeImpersonateStream` (progressive fill — released chunks on one connection) and
// `routeImpersonateStreamOnce` (a ONE-SHOT body: deltas + one terminal end, every connect identical) for the
// zombie-subscription cases, where the connect COUNT is the assertion and a staged reconnect would be noise.
//
// USAGE — call routeTrpc FIRST (for the query/mutation traffic, e.g. `chat.startChat` on the draft path),
// then routeImpersonateStream. Registered last, this handler runs first and either serves the event-stream
// request or falls through (route.fallback) to routeTrpc for everything else.

import { once } from "node:events";
import { createServer } from "node:http";
import type { Page, Request } from "@playwright/test";

/** A subscription's input: `PostEventSource` sends it as the JSON POST body, never the query. */
function subscriptionInput(req: Request): unknown {
  const body = req.postData();
  return body === null ? undefined : JSON.parse(body);
}

/** One SSE frame in the tRPC shape (fields each `\n`-terminated, then a blank line dispatches it). A `retry`
 *  field re-times the `PostEventSource` reconnect delay (default 3s) — the one-shot stub sets it low so a
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

export interface ImpersonateStreamRecorder {
  /** How many subscription requests were served. */
  readonly count: () => number;
  /** The decoded input of the FIRST subscribe (the reconnects carry the same input). */
  readonly firstInput: () => unknown;
  /** The decoded input of the most recent connect. */
  readonly lastInput: () => unknown;
}

export interface StagedImpersonateStreamRecorder extends ImpersonateStreamRecorder {
  readonly releaseNext: () => void;
  readonly closed: Promise<void>;
}

/** Stream the first delta immediately and release later deltas explicitly on the same local HTTP response.
 *  A page close disposes its listener; `closed` observes client cancellation before fixture cleanup. */
export async function routeImpersonateStream(page: Page, deltas: readonly string[], retryMs?: number): Promise<StagedImpersonateStreamRecorder> {
  const inputs: unknown[] = [];
  let release = Promise.withResolvers<void>();
  const closed = Promise.withResolvers<void>();
  const failure = Promise.withResolvers<never>();
  const server = createServer((_request, response) => {
    response.on("close", () => {
      closed.resolve();
      release.resolve();
    });
    void (async (): Promise<void> => {
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      response.write(sseFrame({ event: "connected", data: "{}", ...(retryMs === undefined ? {} : { retry: retryMs }) }));
      for (const [index, delta] of deltas.entries()) {
        if (index > 0) {
          await release.promise;
          release = Promise.withResolvers<void>();
        }
        if (response.destroyed) {
          return;
        }
        response.write(sseFrame({ data: JSON.stringify({ delta }), id: String(index) }));
      }
      response.end(sseFrame({ event: "return", data: "" }));
    })().catch((error: Error) => {
      failure.reject(error);
      response.destroy();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected loopback streaming fixture port");
  }
  page.once("close", () => {
    release.resolve();
    server.closeAllConnections();
    server.close();
  });
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
    inputs.push(subscriptionInput(req));
    await route.continue({ url: `http://127.0.0.1:${address.port}/impersonate` });
  });
  return {
    count: (): number => inputs.length,
    firstInput: (): unknown => inputs.at(0),
    lastInput: (): unknown => inputs.at(-1),
    releaseNext: (): void => release.resolve(),
    closed: Promise.race([closed.promise, failure.promise]),
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
 * The sibling {@link routeImpersonateStream} releases chunks on one connection to make progressive fill observable.
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
    inputs.push(subscriptionInput(req));
    await route.fulfill({ status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-cache" }, body });
  });
  return {
    count: (): number => inputs.length,
    firstInput: (): unknown => inputs.at(0),
    lastInput: (): unknown => inputs.at(-1),
  };
}
