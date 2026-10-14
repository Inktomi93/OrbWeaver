import { createReplayBuffer } from "@orb/kit/replay-buffer";
import { createFrozenClock } from "@orb/testkit/iso/clock.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("clearing releases all retained keys and later recording has no old tail", () => {
  const clock = createFrozenClock();
  const replay = createReplayBuffer<string, string>(1000, clock.now);
  replay.record("first", "old first");
  replay.record("second", "old second");
  expect(replay.size()).toBe(2);
  replay.clear();
  expect(replay.size()).toBe(0);
  expect(replay.snapshot("first")).toEqual([]);
  expect(replay.snapshot("second")).toEqual([]);
  replay.record("first", "fresh");
  expect(replay.size()).toBe(1);
  expect(replay.snapshot("first")).toEqual(["fresh"]);
});
