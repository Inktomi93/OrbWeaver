// Type-level pin for the room-source dispatch table (SSE-1 §4.2 / §12). This is enforcement TIER 2 — the
// property is "a new channel cannot be added without wiring a source for it", and the enforcer is `tsc` at
// `ROOM_SOURCES`, not a gate. These assertions pin the two halves of that:
//   • the table is TOTAL over `StreamChannel` (and no wider — a source for a channel that isn't attachable
//     would mean the ref union and the table disagree);
//   • each entry is narrowed to ITS channel, so an `rpg` source reads `ref.chatId` without a cast and a
//     `user` source has no chatId it could misuse.
// Also pinned: the runtime `roomSourceFor` bridge is the ONLY place the per-channel correlation is widened.

import type { StreamChannel, StreamDataFrame, StreamRoomRef } from "@orb/contracts/stream";
import type { RoomArgs, RoomSourceDef } from "@orb/server/transport/trpc";
import { ROOM_SOURCES, roomSourceFor } from "@orb/server/transport/trpc";
import { expectTypeOf, test } from "vitest";

test("ROOM_SOURCES is total over StreamChannel, and no wider", () => {
  expectTypeOf<keyof typeof ROOM_SOURCES>().toEqualTypeOf<StreamChannel>();
  expectTypeOf(ROOM_SOURCES).toEqualTypeOf<{ [C in StreamChannel]: RoomSourceDef<C> }>();
});

test("each source's ref is narrowed to its own channel", () => {
  expectTypeOf<RoomArgs<"rpg">["ref"]>().toEqualTypeOf<Extract<StreamRoomRef, { channel: "rpg" }>>();
  expectTypeOf<RoomArgs<"user">["ref"]>().toEqualTypeOf<Extract<StreamRoomRef, { channel: "user" }>>();
  // A `user` room has no chatId in scope at all — the self-scoped channels cannot be widened by input.
  expectTypeOf<RoomArgs<"user">["ref"]>().not.toHaveProperty("chatId");
});

test("every pump yields DATA frames only — a source can never mint a control frame", () => {
  expectTypeOf<ReturnType<RoomSourceDef<"rpg">["run"]>>().toEqualTypeOf<AsyncIterable<StreamDataFrame>>();
});

test("the runtime bridge widens the ref exactly once", () => {
  expectTypeOf(roomSourceFor).parameter(0).toEqualTypeOf<StreamRoomRef>();
  expectTypeOf(roomSourceFor).returns.toEqualTypeOf<RoomSourceDef<StreamChannel>>();
});
