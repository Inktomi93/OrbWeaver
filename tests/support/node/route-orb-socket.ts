// routeOrbSocket — the Playwright CT stub for the MULTIPLEXED socket (SSE-1 §12). The ONE SSE stub for
// `stream.connect` (it replaced the per-proc `routeChatStream`/`routeUserStream` helpers as their rooms
// folded), plus the thing a per-proc stub never needed: a LIFECYCLE RECORDER.
//
// A chat CT authors its scripted turn as `chat` FRAMES (`{ channel: "chat", chatId, seq, event }`) — the
// bus event rides verbatim under `event`, and `seq` is the durable cursor that used to be the tracked
// envelope id, so the attach synthetics (`chatOpened`/`historyTruncated`) are expressed by giving them the
// NON-ADVANCING cursor seq exactly as the server does.
//
// Why a handshake instead of a sleep. Under the multiplex the client attaches AFTER the socket is live, and
// the registry DROPS a frame for a room nobody joined (correct — the real server never sends one). So a stub
// that fulfills the whole body on connect would race: the frames could land before the attach. Instead the
// event-stream request AWAITS the expected attaches, then fulfills. Playwright route handlers are async and
// the request simply hangs until the handler resolves — which is what a stream does anyway.
//
// REPLAYABLE ON EVERY CONNECT, not first-only. The old chat stub served an empty body on reconnect, which is
// a latent flake the moment anything exercises a reconnect; this one replays the full script each time.
//
// USAGE — call routeTrpc FIRST (query/mutation traffic), then routeOrbSocket. Registered last, this handler
// runs first: it serves the event-stream request, records `stream.attach`/`stream.detach`, and falls through
// (`route.fallback()`) to routeTrpc for everything else — including answering the attach mutations, which
// routeTrpc resolves to `null` exactly as the real void-returning procedure does.

import type { StreamAttachInput, StreamFrame, StreamRoomRef } from "@orb/contracts/stream";
import { roomKey } from "@orb/contracts/stream";
import type { Page, Request, Route } from "@playwright/test";

/** The typed TERMINAL frame `withSubscriptionErrors` yields when a subscription's source throws a
 *  DomainError (`transport/trpc/subscriptions.ts`). Spelled here rather than imported: the client
 *  discriminates it structurally, and a CT stub must be able to author one without pulling the server in. */
interface SubscriptionErrorPayload {
  readonly __subscriptionError: true;
  readonly code: string;
  readonly message: string;
}

/** Anything the stub can put on the wire — a room frame, or the socket's typed terminal error. */
type ScriptedFrame = StreamFrame | SubscriptionErrorPayload;

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

/** connected → each frame with its per-socket ORDINAL id → return (clean close). */
function socketBody(frames: readonly ScriptedFrame[], includeReturn: boolean): string {
  const out: string[] = [sseFrame({ event: "connected", data: JSON.stringify({}) })];
  for (const [i, frame] of frames.entries()) {
    out.push(sseFrame({ data: JSON.stringify(frame), id: String(i + 1) }));
  }
  if (includeReturn) {
    out.push(sseFrame({ event: "return", data: "" }));
  }
  return out.join("");
}

/** Unvalidated, unnormalized `stream.attach` wire observations; neither the ref nor cursor proves server admission. */
interface AttachRequest {
  readonly ref: StreamRoomRef;
  readonly sinceSeq: number | null;
}

/** Passive, unvalidated and unnormalized wire observations; no method proves server admission or valid IDs. */
export interface OrbSocketRecorder {
  /** How many `stream.connect` EventSource requests were served. ONE per page is the invariant. */
  readonly connects: () => number;
  /** Every attached room ref, in call order — the "did this surface open a room it shouldn't?" lens. */
  readonly attaches: () => readonly StreamRoomRef[];
  /** The same attaches WITH their replay request — the lens for "did this room ask for a replay?". */
  readonly attachRequests: () => readonly AttachRequest[];
  readonly detaches: () => readonly StreamRoomRef[];
  /** Attached room KEYS (`"user"` / `"rpg:<id>"` / `"workloads:<id>"`) — the terse form for an assertion. */
  readonly attachedChannels: () => readonly string[];
}

export interface RouteOrbSocketOptions {
  /** The frames to serve, in order, on EVERY connect. Author them as `{ channel, …, event }`. */
  readonly frames?: readonly ScriptedFrame[];
  /** Serve the body only once this many attach requests have finished with successful HTTP responses (the handshake). @defaultValue 0 */
  readonly awaitAttaches?: number;
  /** Emit the terminal `return` frame so the EventSource closes cleanly. @defaultValue true */
  readonly closeStream?: boolean;
  /**
   * End the FIRST connection's body WITHOUT the terminal `return` frame, so the EventSource sees an EOF and
   * tRPC's link RECONNECTS. This is the only way a CT reaches the gap-heal, which is deliberately skipped on
   * a room's first live edge (BOOT-4X, `data/bus/room-registry.ts`). Every later connection closes cleanly,
   * so the reconnect happens exactly once. @defaultValue false
   */
  readonly dropFirstConnection?: boolean;
  /** Consecutive EOF connections for multi-episode recovery schedules. */
  readonly dropConnectionCount?: number;
  /** Process identity per connection; the last value persists for subsequent reconnects. */
  readonly serverInstanceIds?: readonly string[];
}

const DEFAULT_SERVER_INSTANCE_ID = "orb-ct-server";

/** Decode the `stream.attach`/`stream.detach` inputs out of a (possibly batched) tRPC mutation request. */
function decodeStreamAttaches(req: Request, url: URL, wanted: "attach" | "detach"): AttachRequest[] {
  const procs = decodeURIComponent(url.pathname.split("/api/trpc/")[1] ?? "").split(",");
  if (!procs.includes(`stream.${wanted}`)) {
    return [];
  }
  let body: unknown;
  try {
    body = req.postDataJSON();
  } catch {
    return [];
  }
  const isBatch = url.searchParams.get("batch") === "1";
  const inputBody = isBatch ? body : { 0: body };
  const byIndex = typeof inputBody === "object" && inputBody !== null ? inputBody : {};
  const attaches: AttachRequest[] = [];
  for (const [i, proc] of procs.entries()) {
    if (proc !== `stream.${wanted}`) {
      continue;
    }
    const rawInput: unknown = Reflect.get(byIndex, String(i));
    const input = rawInput as Partial<Pick<StreamAttachInput, "ref" | "sinceSeq">> | null | undefined;
    if (input?.ref !== undefined) {
      attaches.push({ ref: input.ref, sinceSeq: input.sinceSeq ?? null });
    }
  }
  return attaches;
}

/** Matches the ONE multiplexed socket subscription (`stream.connect`) — the procedure
 *  `use-orb-socket.ts` opens. Exported as the sibling of `isImpersonateStreamRequest`: a CT that watches
 *  socket connects needs the same predicate the stub routes on, or the two drift. */
function isOrbSocketRequest(request: { url: () => string }): boolean {
  return request.url().includes("stream.connect");
}

/** Stub the ONE multiplexed socket and record its lifecycle. Non-socket traffic falls through to routeTrpc. */
export async function routeOrbSocket(page: Page, opts: RouteOrbSocketOptions = {}): Promise<OrbSocketRecorder> {
  const frames = opts.frames ?? [];
  const awaitAttaches = opts.awaitAttaches ?? 0;
  const closeStream = opts.closeStream ?? true;
  const dropConnectionCount = opts.dropConnectionCount ?? Number(opts.dropFirstConnection ?? false);
  const serverInstanceIds = opts.serverInstanceIds ?? [DEFAULT_SERVER_INSTANCE_ID];
  const attached: AttachRequest[] = [];
  const detached: AttachRequest[] = [];
  let connects = 0;
  let completedAttaches = 0;
  const handshake = Promise.withResolvers<boolean>();
  const pendingAttaches = new Map<Request, number>();
  let settled = false;
  const settleHandshake = (success: boolean): void => {
    if (settled) {
      return;
    }
    settled = true;
    page.off("requestfinished", requestFinished);
    page.off("requestfailed", requestFailed);
    page.off("close", closeHandshake);
    pendingAttaches.clear();
    handshake.resolve(success);
  };
  const closeHandshake = (): void => {
    settleHandshake(false);
  };
  const requestFailed = (request: Request): void => {
    if (pendingAttaches.has(request)) {
      settleHandshake(false);
    }
  };
  const requestFinished = (request: Request): void => {
    const count = pendingAttaches.get(request);
    if (count === undefined) {
      return;
    }
    pendingAttaches.delete(request);
    void request.response().then(
      (response) => {
        if (response === null || !response.ok()) {
          settleHandshake(false);
          return;
        }
        completedAttaches += count;
        if (completedAttaches >= awaitAttaches) {
          settleHandshake(true);
        }
      },
      () => {
        settleHandshake(false);
      },
    );
  };
  if (awaitAttaches > 0) {
    page.on("requestfinished", requestFinished);
    page.on("requestfailed", requestFailed);
    page.once("close", closeHandshake);
  } else {
    settleHandshake(true);
  }

  const awaitSuccessfulAttaches = async (route: Route): Promise<boolean> => {
    const success = await handshake.promise;
    if (!(success || page.isClosed())) {
      await route.abort("failed");
    }
    return success;
  };

  await page.route("**/api/trpc/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());

    // The SOCKET is ONE procedure — `stream.connect` (packages/client/src/data/bus/use-orb-socket.ts's
    // `trpc.stream.connect.subscriptionOptions`). Matching on the accept header alone (#1491) made this
    // stub answer EVERY tRPC subscription in the CT, `chat.impersonateStream` included: a story that opens
    // both got socket frames on its impersonation stream, and any CT that depended on that was passing
    // because of the stub's reach rather than the app's behaviour. A non-socket stream falls through.
    if ((req.headers()["accept"] ?? "").includes("text/event-stream") && isOrbSocketRequest(req)) {
      connects += 1;
      // The handshake: hold the stream open until the rooms this script targets have attached. A route
      // handler is async, so "not answering yet" IS a live stream from the client's point of view.
      if (!(await awaitSuccessfulAttaches(route))) {
        return;
      }
      // Dropped connections omit `return` → EOF → the link reconnects under the scripted process identity.
      const clean = closeStream && connects > dropConnectionCount;
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
        body: socketBody(
          [
            {
              channel: "control",
              type: "serverReady",
              serverInstanceId: serverInstanceIds[Math.min(connects - 1, serverInstanceIds.length - 1)] ?? DEFAULT_SERVER_INSTANCE_ID,
            },
            ...frames,
          ],
          clean,
        ),
      });
      return;
    }

    const requestAttaches = decodeStreamAttaches(req, url, "attach");
    attached.push(...requestAttaches);
    detached.push(...decodeStreamAttaches(req, url, "detach"));
    if (!settled && requestAttaches.length > 0) {
      pendingAttaches.set(req, requestAttaches.length);
    }
    await route.fallback();
  });

  return {
    connects: (): number => connects,
    attaches: (): readonly StreamRoomRef[] => attached.map((a) => a.ref),
    attachRequests: (): readonly AttachRequest[] => [...attached],
    detaches: (): readonly StreamRoomRef[] => detached.map((a) => a.ref),
    // The ONE routing key, straight from the contract — a hand-rolled projection here would drift the moment
    // a channel is keyed by something other than a chatId (the `workloads` room, S5, is keyed by workloadId).
    attachedChannels: (): readonly string[] => attached.map(({ ref }) => roomKey(ref)),
  };
}
