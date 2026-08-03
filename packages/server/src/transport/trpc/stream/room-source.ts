// The ONE `RoomSourceDef<C>` shape every room source satisfies (SSE-1 §4.2). Lives APART from the
// `ROOM_SOURCES` table (`room-sources.ts`) for the same reason `domain/workloads/contract/runner.ts` lives
// apart from `substrate/dispatch.ts`: each source file depends on this for the TYPE while the table depends
// on this for the type AND on each source for the VALUE — one file for both would be a dependency cycle
// (dep-cruiser `no-circular`, and it is a real one: the sources would import the table that imports them).
//
// A room source owns TWO things and nothing else: the attach verdict, and the per-subscription pump. Every
// per-viewer verdict — replay, clamp, strip, projection — lives in the pump, which is the SAME
// per-subscription scope it lives in today, so the fold changes no authorization outcome and no gate
// ordering. The multiplexer above it is BYTE-BLIND (§4.3): it may queue, order, drop, and frame; it may not
// read, strip, clamp, or synthesize a domain event.

import type { Principal } from "@orb/contracts/identity";
import type { StreamChannel, StreamDataFrame, StreamRoomRef } from "@orb/contracts/stream";
import type { Services } from "../context.ts";

/** What every room source is handed. `ref` is narrowed to its own channel, so an `rpg` source reads
 *  `ref.chatId` without a cast and a `user` source has no chatId to misuse. */
export interface RoomArgs<C extends StreamChannel> {
  readonly ref: Extract<StreamRoomRef, { readonly channel: C }>;
  readonly principal: Principal;
  readonly services: Services;
  /**
   * The deployment's multi-human capability (`Context.multiHumanCapable`), threaded as DATA. It is the
   * PD-106 belt a per-room surface may need on its ATTACH — the socket itself is `authedProcedure` by
   * design (a single-user deployment must still get its user/chat/rpg rooms), so a belt that used to be
   * procedure middleware becomes a per-ROOM verdict (`sources/notifications.ts`). Threaded rather than
   * re-derived because the request seam already resolved it once (`transport/trpc/context.ts`).
   */
  readonly multiHumanCapable: boolean;
}

export interface RoomSourceDef<C extends StreamChannel> {
  /**
   * Can this room RESUME — i.e. does its channel have a durable log a pump can replay from a cursor? It is
   * the same property that makes the queue's `lag` overflow policy legal (a shed is refillable only if the
   * rows can be re-read), and a contract test pins the two tables against each other.
   *
   * It gates the RECONNECT BARRIER (`socket.ts`): a resumable room does not resume delivery on a reconnect
   * until the client announces where IT got to, because the server's cursor counts frames handed to the
   * previous socket's writer — ahead of what the client received. A live-only room has no cursor to be wrong
   * about and must not wait (its client heals with a blanket invalidate).
   */
  readonly resumable: boolean;
  /** Runs INSIDE `stream.attach`. THROW to refuse (a `DomainNotFoundError` → the leak-free NOT_FOUND);
   *  return to accept. "Refuse at attach" vs "accept-and-withhold" is preserved PER CHANNEL — that asymmetry
   *  is deliberate (a chat/rpg room is legitimately attachable before it exists; an automation room is not). */
  readonly authorizeAttach: (args: RoomArgs<C>) => Promise<void>;
  /** The per-subscription pump. Yields DATA frames only; the socket stamps the wire ordinal and advances the
   *  room cursor from a frame's own `seq` (a WITHHELD row yields nothing and therefore cannot advance it —
   *  the rule that doubles as the member-strip leak fence, §5.5). */
  readonly run: (args: RoomArgs<C> & { readonly cursor: number | null; readonly signal: AbortSignal }) => AsyncIterable<StreamDataFrame>;
}
