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

import type { StreamFrame, StreamRoomRef } from "@orb/contracts/stream";
import type { Page, Request } from "@playwright/test";

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
function socketBody(frames: readonly StreamFrame[], includeReturn: boolean): string {
  const out: string[] = [sseFrame({ event: "connected", data: JSON.stringify({}) })];
  for (const [i, frame] of frames.entries()) {
    out.push(sseFrame({ data: JSON.stringify(frame), id: String(i + 1) }));
  }
  if (includeReturn) {
    out.push(sseFrame({ event: "return", data: "" }));
  }
  return out.join("");
}

/** One recorded `stream.attach` — the room AND its replay request. `sinceSeq: 0` is a durable room asking to
 *  replay from the beginning (the chat bus's draft→committed seed); `null`/absent is live-only. */
export interface AttachRequest {
  readonly ref: StreamRoomRef;
  readonly sinceSeq: number | null;
}

export interface OrbSocketRecorder {
  /** How many `stream.connect` EventSource requests were served. ONE per page is the invariant. */
  readonly connects: () => number;
  /** Every attached room ref, in call order — the "did this surface open a room it shouldn't?" lens. */
  readonly attaches: () => readonly StreamRoomRef[];
  /** The same attaches WITH their replay request — the lens for "did this room ask for a replay?". */
  readonly attachRequests: () => readonly AttachRequest[];
  readonly detaches: () => readonly StreamRoomRef[];
  /** Attached room KEYS (`"user"` / `"rpg:<id>"`) — the terse form for an assertion. */
  readonly attachedChannels: () => readonly string[];
}

export interface RouteOrbSocketOptions {
  /** The frames to serve, in order, on EVERY connect. Author them as `{ channel, …, event }`. */
  readonly frames?: readonly StreamFrame[];
  /** Serve the body only once this many attaches have been recorded (the handshake). @defaultValue 0 */
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
}

const HANDSHAKE_TIMEOUT_MS = 5000;
const HANDSHAKE_POLL_MS = 25;

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
  const byIndex = isBatch ? ((body as Record<string, unknown>) ?? {}) : { 0: body };
  const attaches: AttachRequest[] = [];
  for (const [i, proc] of procs.entries()) {
    if (proc !== `stream.${wanted}`) {
      continue;
    }
    const input = byIndex[String(i)] as { ref?: StreamRoomRef; sinceSeq?: number | null } | undefined;
    if (input?.ref !== undefined) {
      attaches.push({ ref: input.ref, sinceSeq: input.sinceSeq ?? null });
    }
  }
  return attaches;
}

/** Stub the ONE multiplexed socket and record its lifecycle. Non-socket traffic falls through to routeTrpc. */
export async function routeOrbSocket(page: Page, opts: RouteOrbSocketOptions = {}): Promise<OrbSocketRecorder> {
  const frames = opts.frames ?? [];
  const awaitAttaches = opts.awaitAttaches ?? 0;
  const closeStream = opts.closeStream ?? true;
  const dropFirstConnection = opts.dropFirstConnection ?? false;
  const attached: AttachRequest[] = [];
  const detached: AttachRequest[] = [];
  let connects = 0;

  await page.route("**/api/trpc/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());

    if ((req.headers()["accept"] ?? "").includes("text/event-stream")) {
      connects += 1;
      // The handshake: hold the stream open until the rooms this script targets have attached. A route
      // handler is async, so "not answering yet" IS a live stream from the client's point of view.
      const deadline = Date.now() + HANDSHAKE_TIMEOUT_MS;
      while (attached.length < awaitAttaches && Date.now() < deadline) {
        // biome-ignore lint/performance/noAwaitInLoops: polling for the handshake is inherently sequential.
        await new Promise((resolve) => setTimeout(resolve, HANDSHAKE_POLL_MS));
      }
      // A dropped FIRST connection omits the `return` frame → EOF → the link reconnects (see the option).
      const clean = closeStream && !(dropFirstConnection && connects === 1);
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
        body: socketBody(frames, clean),
      });
      return;
    }

    attached.push(...decodeStreamAttaches(req, url, "attach"));
    detached.push(...decodeStreamAttaches(req, url, "detach"));
    await route.fallback();
  });

  return {
    connects: (): number => connects,
    attaches: (): readonly StreamRoomRef[] => attached.map((a) => a.ref),
    attachRequests: (): readonly AttachRequest[] => [...attached],
    detaches: (): readonly StreamRoomRef[] => detached.map((a) => a.ref),
    attachedChannels: (): readonly string[] => attached.map(({ ref }) => ("chatId" in ref ? `${ref.channel}:${ref.chatId}` : ref.channel)),
  };
}
