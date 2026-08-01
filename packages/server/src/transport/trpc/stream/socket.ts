// `runSocket` — the ONE socket generator (SSE-1 §5.2). Given a cell the RESOLVER already adopted, it
// re-hydrates a pump per already-attached room, follows room changes while live, merges every pump into ONE
// bounded queue, and yields the wire envelopes. This is the only place in `stream/` that touches more than
// one room at a time.
//
// THE SETUP SLICE IS ATOMIC BY CONSTRUCTION. An async generator's body does not start until the first
// `next()`, and everything up to its first `await` runs in one uninterrupted task. `attach`/`detach` arrive
// on OTHER tasks (batched HTTP mutations), so starting the re-hydration pumps and registering the room
// listener in that pre-await slice is what makes "an attach cannot land in the gap" true without a lock.
// (The ADOPT is deliberately NOT here — a refusal has to happen while the subscription can still be
// rejected; see `routers/stream.ts`.)
//
// PER-ROOM FAULT ISOLATION — the property that does not exist today. A pump that throws yields a
// `roomFailed` control frame and detaches THAT room; the socket keeps delivering every other room. Today the
// same throw ends the whole stream (`withSubscriptionErrors` yields a terminal frame and returns), which
// under one socket would be a total freshness blackout. `withSubscriptionErrors` still wraps THIS generator,
// for a genuine socket-level fault.
//
// THE TRACKED ID IS AN ORDINAL (§3.3): a per-socket counter, never a cursor. It exists only because
// `withSubscriptionErrors` requires uniform tracked envelopes (a mix breaks the client's discriminant
// narrowing). `Last-Event-ID` on connect is deliberately IGNORED — one SSE stream has one resume id and this
// socket carries N independent cursors; the resume truth is the per-room cursor in the cell.

import type { Principal } from "@orb/contracts/identity";
import type { StreamDataFrame, StreamErrorCode, StreamFrame, StreamRoomRef } from "@orb/contracts/stream";
import { roomKey, STREAM_ERROR_CODES } from "@orb/contracts/stream";
import type { SocketId } from "@orb/kit/ids";
import type { TrackedEnvelope } from "@trpc/server";
import { tracked } from "@trpc/server";
import { getLog } from "#foundation/observability";
import type { Services } from "../context";
import { classifyDomainError } from "../error-mapping";
import { createFrameQueue } from "./frame-queue";
import { roomSourceFor } from "./room-sources";
import type { SocketCell, SocketRegistry } from "./socket-registry";

/** What a room's fault becomes on the wire. A DOMAIN error keeps its classified code + message (the same
 *  typed-terminal-frame contract `withSubscriptionErrors` gives a whole stream today); anything else is a
 *  genuine bug and collapses to a generic INTERNAL_SERVER_ERROR — internals never reach a subscriber. */
function roomFailure(err: unknown): { readonly code: StreamErrorCode; readonly message: string } {
  const mapped = classifyDomainError(err);
  if (mapped === null) {
    return { code: "INTERNAL_SERVER_ERROR", message: "The room stopped unexpectedly." };
  }
  // `@orb/contracts` cannot depend on `@trpc/server`, so the wide tRPC code union narrows onto our closed
  // vocabulary HERE — the one mapper seam. The classifier only produces members of it.
  const code = STREAM_ERROR_CODES.find((known) => known === mapped.code);
  return { code: code ?? "INTERNAL_SERVER_ERROR", message: mapped.message };
}

export interface RunSocketArgs {
  readonly registry: SocketRegistry;
  /** ALREADY ADOPTED by the resolver — so a cross-principal socketId is a real NOT_FOUND rejection of the
   *  subscription rather than a typed frame the client would have to interpret (an async generator's body
   *  does not run until the first pull, which is far too late to refuse a connection). */
  readonly cell: SocketCell;
  readonly principal: Principal;
  readonly services: Services;
  readonly signal: AbortSignal;
}

export async function* runSocket(args: RunSocketArgs): AsyncGenerator<TrackedEnvelope<StreamFrame>> {
  const { registry, cell, principal, services, signal } = args;
  const socketId: SocketId = cell.socketId;
  const queue = createFrameQueue({ cursorFor: (key) => cell.rooms.get(key)?.cursor ?? null });
  const pumps = new Map<string, AbortController>();

  async function pumpRoom(ref: StreamRoomRef, cursor: number | null, control: AbortController): Promise<void> {
    const key = roomKey(ref);
    try {
      const source = roomSourceFor(ref);
      for await (const frame of source.run({ ref, principal, services, cursor, signal: control.signal })) {
        if (control.signal.aborted) {
          return;
        }
        // The cursor advances ONLY on a frame that actually carried a durable seq — a withheld/clamped row
        // yields nothing, so the gap is re-derived from CURRENT membership on the next replay (§5.3/§5.5).
        advanceCursor(key, frame);
        queue.push(ref, frame);
      }
    } catch (err) {
      if (control.signal.aborted) {
        return; // teardown (detach / socket close), not a fault
      }
      const failure = roomFailure(err);
      getLog().warn({ err, channel: ref.channel, userId: principal.userId }, "stream: room pump failed");
      queue.pushControl({ channel: "control", type: "roomFailed", ref, ...failure });
      registry.detach(principal.userId, socketId, ref);
    }
  }

  function advanceCursor(key: string, frame: StreamDataFrame): void {
    if (!("seq" in frame)) {
      return;
    }
    const room = cell.rooms.get(key);
    if (room !== undefined) {
      room.cursor = frame.seq;
    }
  }

  function startPump(ref: StreamRoomRef, cursor: number | null): void {
    const key = roomKey(ref);
    pumps.get(key)?.abort();
    const control = new AbortController();
    pumps.set(key, control);
    queue.pushControl({ channel: "control", type: "attached", ref });
    void pumpRoom(ref, cursor, control);
  }

  function stopPump(ref: StreamRoomRef): void {
    const key = roomKey(ref);
    pumps.get(key)?.abort();
    pumps.delete(key);
    queue.pushControl({ channel: "control", type: "detached", ref });
  }

  function teardown(): void {
    for (const control of pumps.values()) {
      control.abort();
    }
    pumps.clear();
    queue.close();
  }

  // ── the atomic setup slice (no `await` until the drain loop) ──────────────────────────────────────────
  registry.goLive(cell, { onAttach: startPump, onDetach: stopPump });
  for (const room of cell.rooms.values()) {
    startPump(room.ref, room.cursor);
  }
  signal.addEventListener("abort", teardown, { once: true });

  let ordinal = 0;
  try {
    for await (const frame of queue.drain()) {
      ordinal += 1;
      yield tracked(String(ordinal), frame);
    }
  } finally {
    // Reached on client-gone, server shutdown, AND the consumer's `.return()`. The room set is LEFT IN
    // PLACE for the reap window — that is what makes a reconnect server-sticky.
    signal.removeEventListener("abort", teardown);
    teardown();
    registry.goDark(cell);
  }
}
