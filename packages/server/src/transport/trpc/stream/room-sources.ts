// `ROOM_SOURCES` — the per-channel dispatch table for the multiplexed socket (SSE-1 §4.2). The SHAPE each
// entry satisfies lives in `room-source.ts` (the cycle-free seam; see its header).
//
// EXHAUSTIVENESS IS TIER 2, NOT A GATE (constitution §2.2 — push it up the ladder): the mapped-type Record
// below is total over `StreamChannel`, so a channel added to `@orb/contracts/stream` fails `tsc` HERE. The
// `RUNNERS` gold standard (`domain/workloads/substrate/dispatch.ts`) is the shape being mirrored, including
// its ONE contained two-cast bridge (`roomSourceFor`) where the static per-channel guarantee meets a
// runtime-union ref.
//
// THE STAGED FOLD IS COMPLETE (S4). The vocabulary was complete from S0 (the wire union is the thing that
// must not churn) and the rooms folded ONE STAGE AT A TIME, each stage DELETING the per-proc subscription it
// replaced — no dual transport, ever. Every channel below is now a MOVED generator body, so the
// `refusedUntilFolded` placeholder (a room that refused at attach because its procedure still existed) is
// gone with the last of them; what keeps a folded proc from coming back is the `single-stream-transport`
// gate, not a row here.

import type { StreamChannel, StreamRoomRef } from "@orb/contracts/stream";
import type { RoomSourceDef } from "./room-source";
import { automationRoomSource } from "./sources/automation";
import { chatRoomSource } from "./sources/chat";
import { notificationsRoomSource } from "./sources/notifications";
import { rpgRoomSource } from "./sources/rpg";
import { userRoomSource } from "./sources/user";

export const ROOM_SOURCES: { [C in StreamChannel]: RoomSourceDef<C> } = {
  user: userRoomSource,
  rpg: rpgRoomSource,
  chat: chatRoomSource,
  notifications: notificationsRoomSource,
  automation: automationRoomSource,
};

/**
 * The two-cast bridge — the ONE sanctioned escape where the static `{ [C]: RoomSourceDef<C> }` guarantee
 * meets a runtime-union `ref` (the `dispatchAndRun` precedent). Indexing by a union-typed channel yields a
 * union of sources TS cannot call, and the ref↔channel correlation is lost across it; the cast is contained
 * HERE. Do not spread it.
 */
export function roomSourceFor(ref: StreamRoomRef): RoomSourceDef<StreamChannel> {
  return ROOM_SOURCES[ref.channel] as RoomSourceDef<StreamChannel>;
}
