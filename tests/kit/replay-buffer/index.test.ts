import { createReplayBuffer } from "@orb/kit/replay-buffer";
import { expect, test } from "vitest";

// A controllable clock — the injected `now` seam keeps these tests deterministic without faking
// any global (no Date.now / new Date).
function clock(): { now: () => number; set: (ms: number) => void } {
  let t = 0;
  return {
    now: (): number => t,
    set: (ms: number): void => {
      t = ms;
    },
  };
}

test("records and replays events for a key in emit order", () => {
  const c = clock();
  const buf = createReplayBuffer<string, string>(1000, c.now);
  buf.record("k", "a");
  c.set(400);
  buf.record("k", "b");
  expect(buf.snapshot("k")).toEqual(["a", "b"]);
});

test("snapshot of an unknown key is empty", () => {
  const c = clock();
  const buf = createReplayBuffer<string, string>(1000, c.now);
  expect(buf.snapshot("missing")).toEqual([]);
});

test("prunes only entries older than the TTL window, keeping live ones", () => {
  const c = clock();
  const buf = createReplayBuffer<string, string>(1000, c.now);
  buf.record("k", "old"); // t=0
  c.set(900);
  buf.record("k", "new"); // t=900 (no sweep yet: 900 < ttl)
  c.set(1100); // cutoff = 100 → "old"@0 expires, "new"@900 survives
  expect(buf.snapshot("k")).toEqual(["new"]);
});

test("a fully expired key drops out (snapshot empty, key released)", () => {
  const c = clock();
  const buf = createReplayBuffer<string, string>(1000, c.now);
  buf.record("k", "a"); // t=0
  c.set(500);
  buf.record("k", "b"); // t=500
  c.set(1600); // cutoff = 600 → both expire
  expect(buf.snapshot("k")).toEqual([]);
  expect(buf.size()).toBe(0);
});

test("size reflects the number of retained keys", () => {
  const c = clock();
  const buf = createReplayBuffer<string, string>(1000, c.now);
  buf.record("k1", "a");
  buf.record("k2", "b");
  expect(buf.size()).toBe(2);
});

test("the global sweep drops keys whose newest entry has aged out", () => {
  const c = clock();
  const buf = createReplayBuffer<string, string>(1000, c.now);
  buf.record("k1", "e1"); // t=0
  c.set(2000); // a record now triggers the sweep (2000 ≥ ttl since last sweep)
  buf.record("k2", "e2"); // sweep drops stale k1, then records k2
  expect(buf.size()).toBe(1);
  expect(buf.snapshot("k1")).toEqual([]);
  expect(buf.snapshot("k2")).toEqual(["e2"]);
});
