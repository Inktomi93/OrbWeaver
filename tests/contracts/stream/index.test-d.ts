// Type-level pin for the multiplexed-stream vocabulary (SSE-1 §3.2) — the `tsc`-time twin of
// index.contract.test.ts's runtime checks. Two properties no runtime test can see:
//   • the DATA-frame arms and the ROOM channels are the same set, in BOTH directions — a channel added to
//     `StreamRoomRef` without a frame arm (or a frame arm for a channel that isn't attachable) fails here,
//     which is the compile-time half of "a new channel must be wired end to end";
//   • `control` is a frame-only channel — it can never be attached, so `Record<StreamChannel, …>` maps
//     (`ROOM_SOURCES`, the overflow-policy table) stay total over ROOMS only.

import type { AutomationBusEvent } from "@orb/contracts/automation";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { InboxView } from "@orb/contracts/notifications";
import type { RpgBusEvent } from "@orb/contracts/rpg";
import type { StreamChannel, StreamControlFrame, StreamDataFrame, StreamErrorCode, StreamFrame, StreamFrameFor, StreamRoomRef } from "@orb/contracts/stream";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { WorkloadEvent } from "@orb/contracts/workloads";
import type { ChatId, WorkloadId } from "@orb/kit/ids";
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

// THE FRAME SHAPES, field for field. The socket is not parsed per frame (a chat room streams one frame per
// token), so these pins are the wire contract: a field added to a frame arm is a deliberate edit here, never a
// silent widening of what every attached tab receives. `event` payloads keep their own contracts; the arms
// below pin the envelope around them. The procedure-level output is pinned in
// `tests/server/transport/trpc/routers/stream.test-d.ts`.
test("each data-frame arm carries exactly its routing fields and its room's event", () => {
  expectTypeOf<StreamDataFrame>().toEqualTypeOf<
    | { readonly channel: "user"; readonly event: UserBusEvent }
    | { readonly channel: "notifications"; readonly seq: number; readonly event: InboxView }
    | { readonly channel: "chat"; readonly chatId: ChatId; readonly seq: number; readonly event: ChatBusEvent }
    | { readonly channel: "rpg"; readonly chatId: ChatId; readonly event: RpgBusEvent }
    | { readonly channel: "automation"; readonly chatId: ChatId; readonly event: AutomationBusEvent }
    | { readonly channel: "workloads"; readonly workloadId: WorkloadId; readonly event: WorkloadEvent }
  >();
});

test("each control-frame arm carries exactly its declared fields", () => {
  expectTypeOf<Extract<StreamControlFrame, { type: "attached" }>>().toEqualTypeOf<
    { readonly channel: "control" } & { readonly type: "attached"; readonly ref: StreamRoomRef }
  >();
  expectTypeOf<Extract<StreamControlFrame, { type: "detached" }>>().toEqualTypeOf<
    { readonly channel: "control" } & { readonly type: "detached"; readonly ref: StreamRoomRef }
  >();
  expectTypeOf<Extract<StreamControlFrame, { type: "roomLagged" }>>().toEqualTypeOf<
    { readonly channel: "control" } & { readonly type: "roomLagged"; readonly ref: StreamRoomRef; readonly cursor: number | null }
  >();
  expectTypeOf<Extract<StreamControlFrame, { type: "roomFailed" }>>().toEqualTypeOf<
    { readonly channel: "control" } & { readonly type: "roomFailed"; readonly ref: StreamRoomRef; readonly code: StreamErrorCode; readonly message: string }
  >();
  expectTypeOf<StreamControlFrame["type"]>().toEqualTypeOf<"attached" | "detached" | "roomLagged" | "roomFailed">();
});

test("StreamFrameFor narrows to the one arm a room hook receives", () => {
  expectTypeOf<StreamFrameFor<"user">>().toEqualTypeOf<Extract<StreamDataFrame, { channel: "user" }>>();
  // The nesting rule: the bus event rides VERBATIM under `event`, keeping its OWN discriminant — never
  // flattened into the frame, never renamed. Derived from the bus union itself (no re-spell), so a member
  // added to `RpgBusEvent` needs no change here and a frame that started mapping/wrapping the event reds.
  expectTypeOf<StreamFrameFor<"rpg">["event"]>().toEqualTypeOf<RpgBusEvent>();
  expectTypeOf<StreamFrameFor<"user">["event"]>().toEqualTypeOf<UserBusEvent>();
});
