// Room source: `user` — the per-user "an entity you own changed" live stream (SSE-1 §4.2), MOVED verbatim
// from `routers/sessions.ts::streamUserEvents`. Nothing about the stream changed: it attaches the
// process-local `user-events-bus` channel for the caller's own `userId` and relays; the client gap-heals
// every (re)connect with a blanket invalidate, so a dropped tick costs one refetch and no durable log is
// warranted.
//
// AUTHZ: there is nothing to gate. The channel key IS `principal.userId` (never client input, and the room
// ref carries no field that could widen it), so `authorizeAttach` is a no-op and there is no per-yield
// re-gate — the same posture the deleted procedure had. This room is deliberately NOT behind the
// multi-human belt: a user with two browsers is not a multi-human deployment, and cross-device freshness is
// the whole point of the lane.

import type { StreamDataFrame } from "@orb/contracts/stream";
import { subscribeUserEvents } from "../../user-events-bus";
import type { RoomSourceDef } from "../room-source";

export const userRoomSource: RoomSourceDef<"user"> = {
  // LIVE-ONLY: no durable log, no cursor — the client's blanket gap-heal is this room's recovery.
  resumable: false,
  authorizeAttach: () => Promise.resolve(),
  async *run({ principal, signal }): AsyncGenerator<StreamDataFrame> {
    for await (const event of subscribeUserEvents(principal.userId, signal)) {
      yield { channel: "user", event };
    }
  },
};
