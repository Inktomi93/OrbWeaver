// `ROOM_SOURCES` — the runtime half of the per-channel table (its totality over `StreamChannel` is a `tsc`
// property, pinned in the sibling `.test-d.ts`).
//
// What needs a RUNTIME pin is the one fact the table states twice: a channel is RESUMABLE (it has a durable
// log a pump can replay from a cursor) exactly when its overflow policy is `lag` (a shed is legal only if
// the shed rows can be re-read). They live in different modules on purpose — `resumable` gates the reconnect
// barrier in `socket.ts`, `lag` gates the queue's shedding — and a channel that acquires one without the
// other is either a room that waits forever for a resume it cannot perform, or a room whose shed rows are
// gone. tsc cannot see the correspondence; this can.

import { STREAM_CHANNELS } from "@orb/contracts/stream";
import { OVERFLOW_POLICIES, ROOM_SOURCES } from "@orb/server/transport/trpc";
import { expect, test } from "../../../../support/fixtures";

test("a channel is `resumable` exactly when its overflow policy is `lag` — durability, stated once per meaning", () => {
  const resumable = STREAM_CHANNELS.filter((channel) => ROOM_SOURCES[channel].resumable);
  const lagging = STREAM_CHANNELS.filter((channel) => OVERFLOW_POLICIES[channel] === "lag");

  expect(resumable).toEqual(lagging);
  // …and the set is the durable-log one, named so a future channel has to answer the question deliberately.
  expect(resumable).toEqual(["notifications", "chat"]);
});
