import type { AutomationBusEvent } from "@orb/contracts/automation";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { InboxView } from "@orb/contracts/notifications";
import type { RpgBusEvent } from "@orb/contracts/rpg";
import type { StreamChannel, StreamControlFrame, StreamDataFrame, StreamErrorCode, StreamFrame, StreamFrameFor, StreamRoomRef } from "@orb/contracts/stream";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { WorkloadEvent } from "@orb/contracts/workloads";
import type { ChatId, WorkloadId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

test("room references and data-frame channels agree while control remains frame-only", () => {
  expectTypeOf<StreamDataFrame["channel"]>().toEqualTypeOf<StreamChannel>();
  expectTypeOf<StreamRoomRef["channel"]>().toEqualTypeOf<StreamChannel>();
  expectTypeOf<Extract<StreamChannel, "control">>().toBeNever();
  expectTypeOf<StreamControlFrame["channel"]>().toEqualTypeOf<"control">();
  expectTypeOf<StreamFrame>().toEqualTypeOf<StreamDataFrame | StreamControlFrame>();
});

test("each data frame retains exactly its routing identity, durable cursor and canonical event", () => {
  expectTypeOf<StreamDataFrame>().toEqualTypeOf<
    | { readonly channel: "user"; readonly event: UserBusEvent }
    | { readonly channel: "notifications"; readonly seq: number; readonly event: InboxView }
    | { readonly channel: "chat"; readonly chatId: ChatId; readonly seq: number; readonly event: ChatBusEvent }
    | { readonly channel: "rpg"; readonly chatId: ChatId; readonly event: RpgBusEvent }
    | { readonly channel: "automation"; readonly chatId: ChatId; readonly event: AutomationBusEvent }
    | { readonly channel: "workloads"; readonly workloadId: WorkloadId; readonly event: WorkloadEvent }
  >();
});

test("control frames distinguish process readiness, attachment, cursor lag and terminal room failure", () => {
  expectTypeOf<Extract<StreamControlFrame, { type: "serverReady" }>>().toEqualTypeOf<
    { readonly channel: "control" } & { readonly type: "serverReady"; readonly serverInstanceId: string }
  >();
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
  expectTypeOf<StreamControlFrame["type"]>().toEqualTypeOf<"serverReady" | "attached" | "detached" | "roomLagged" | "roomFailed">();
});

test("a room hook receives its own frame and the unchanged nested event type", () => {
  expectTypeOf<StreamFrameFor<"user">>().toEqualTypeOf<Extract<StreamDataFrame, { channel: "user" }>>();
  expectTypeOf<StreamFrameFor<"chat">["event"]>().toEqualTypeOf<ChatBusEvent>();
  expectTypeOf<StreamFrameFor<"rpg">["event"]>().toEqualTypeOf<RpgBusEvent>();
  expectTypeOf<StreamFrameFor<"automation">["event"]>().toEqualTypeOf<AutomationBusEvent>();
  expectTypeOf<StreamFrameFor<"notifications">["event"]>().toEqualTypeOf<InboxView>();
  expectTypeOf<StreamFrameFor<"workloads">["event"]>().toEqualTypeOf<WorkloadEvent>();
});
