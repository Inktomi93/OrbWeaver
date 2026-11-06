// @subject packages/server/src/domain/chat/substrate/auth/clamp.ts
// @subject packages/server/src/domain/chat/contract/views.ts
import type { HistoryFloorSeq } from "@orb/contracts/chat";
import type { ChatService, isBelowHistoryFloor } from "@orb/server/domain/chat";
import { expectTypeOf, test } from "vitest";

// The membership guard returns `HistoryFloorSeq` as its `historyFloorSeq` (guard.ts `GatedMembership`).
type GuardFloor = HistoryFloorSeq;
type EventFloor = Parameters<typeof isBelowHistoryFloor>[1];
type AttachFloor = Awaited<ReturnType<ChatService["chatEventBounds"]>>["historyFloorSeq"];

test("the event verdict and live attach carrier retain the membership guard's floor", () => {
  expectTypeOf<GuardFloor>().toExtend<EventFloor>();
  expectTypeOf<GuardFloor>().toExtend<AttachFloor>();
  // @ts-expect-error A raw message sequence is not a resolved viewer history floor.
  expectTypeOf<number>().toExtend<EventFloor>();
  // @ts-expect-error A live subscriber's floor must retain the guard-derived brand.
  expectTypeOf<number>().toExtend<AttachFloor>();
});
