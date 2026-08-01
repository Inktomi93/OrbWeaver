// Type-level pin for the multiplexed-stream vocabulary (SSE-1 §3.2) — the `tsc`-time twin of
// index.contract.test.ts's runtime checks. Two properties no runtime test can see:
//   • the DATA-frame arms and the ROOM channels are the same set, in BOTH directions — a channel added to
//     `StreamRoomRef` without a frame arm (or a frame arm for a channel that isn't attachable) fails here,
//     which is the compile-time half of "a new channel must be wired end to end";
//   • `control` is a frame-only channel — it can never be attached, so `Record<StreamChannel, …>` maps
//     (`ROOM_SOURCES`, the overflow-policy table) stay total over ROOMS only.

import type { RpgBusEvent } from "@orb/contracts/rpg";
import type { StreamChannel, StreamControlFrame, StreamDataFrame, StreamFrame, StreamFrameFor, StreamRoomRef } from "@orb/contracts/stream";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import { expectTypeOf, test } from "vitest";

test("the data-frame arms are exactly the room channels", () => {
  expectTypeOf<StreamDataFrame["channel"]>().toEqualTypeOf<StreamChannel>();
  expectTypeOf<StreamRoomRef["channel"]>().toEqualTypeOf<StreamChannel>();
});

test("control is a frame channel, never a room channel", () => {
  expectTypeOf<StreamControlFrame["channel"]>().toEqualTypeOf<"control">();
  expectTypeOf<StreamFrame>().toEqualTypeOf<StreamDataFrame | StreamControlFrame>();
  // @ts-expect-error — "control" is not a member of StreamChannel, so it can never be attached.
  const attachable: StreamChannel = "control";
  void attachable;
});

test("StreamFrameFor narrows to the one arm a room hook receives", () => {
  expectTypeOf<StreamFrameFor<"user">>().toEqualTypeOf<Extract<StreamDataFrame, { channel: "user" }>>();
  // The nesting rule: the bus event rides VERBATIM under `event`, keeping its OWN discriminant — never
  // flattened into the frame, never renamed. Derived from the bus union itself (no re-spell), so a member
  // added to `RpgBusEvent` needs no change here and a frame that started mapping/wrapping the event reds.
  expectTypeOf<StreamFrameFor<"rpg">["event"]>().toEqualTypeOf<RpgBusEvent>();
  expectTypeOf<StreamFrameFor<"user">["event"]>().toEqualTypeOf<UserBusEvent>();
});
