// `ROOM_SOURCES` — the per-channel dispatch table for the multiplexed socket (SSE-1 §4.2). The SHAPE each
// entry satisfies lives in `room-source.ts` (the cycle-free seam; see its header).
//
// EXHAUSTIVENESS IS TIER 2, NOT A GATE (constitution §2.2 — push it up the ladder): the mapped-type Record
// below is total over `StreamChannel`, so a channel added to `@orb/contracts/stream` fails `tsc` HERE. The
// `RUNNERS` gold standard (`domain/workloads/substrate/dispatch.ts`) is the shape being mirrored, including
// its ONE contained two-cast bridge (`roomSourceFor`) where the static per-channel guarantee meets a
// runtime-union ref.
//
// STAGED FOLD: the vocabulary is complete from S0 (the wire union is the thing that must not churn), but the
// rooms fold ONE STAGE AT A TIME and each stage DELETES the per-proc subscription it replaces — no dual
// transport, ever. A channel whose procedure still exists is therefore NOT attachable here: it refuses at
// attach with the standard leak-free NOT_FOUND, and the commit that folds it replaces the refusal with the
// moved generator body. `refusedUntilFolded` is that refusal, with the stage that deletes it named.

import type { StreamChannel, StreamDataFrame, StreamRoomRef } from "@orb/contracts/stream";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { RoomSourceDef } from "./room-source";
import { chatRoomSource } from "./sources/chat";
import { notificationsRoomSource } from "./sources/notifications";
import { rpgRoomSource } from "./sources/rpg";
import { userRoomSource } from "./sources/user";

/** An iterable that ends immediately — the pump of a room that cannot be attached, and therefore is never
 *  reached. Not a generator: an empty `async function*` is three lint suppressions arguing about a body
 *  that has nothing to say. */
const NO_FRAMES: AsyncIterable<StreamDataFrame> = {
  [Symbol.asyncIterator]: () => ({ next: () => Promise.resolve({ done: true, value: undefined }) }),
};

/** A channel whose per-proc subscription has NOT folded yet: not attachable, refused exactly like a room
 *  that does not exist. Deleted by the commit that moves the generator body in. */
function refusedUntilFolded<C extends StreamChannel>(channel: C, stage: string): RoomSourceDef<C> {
  return {
    // Unreachable either way (it refuses at attach), but stated honestly per channel so the table stays
    // true when the stage lands: `automation` is ephemeral by design (no durable row, no cursor).
    resumable: false,
    authorizeAttach: () => Promise.reject(new DomainNotFoundError("stream room", `${channel} (folds at ${stage})`)),
    run: () => NO_FRAMES,
  };
}

export const ROOM_SOURCES: { [C in StreamChannel]: RoomSourceDef<C> } = {
  user: userRoomSource,
  rpg: rpgRoomSource,
  chat: chatRoomSource,
  notifications: notificationsRoomSource,
  automation: refusedUntilFolded("automation", "S4"),
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
