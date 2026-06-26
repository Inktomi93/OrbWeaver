// Proves the unit lane + the composed fixtures run (BUILD-PLAN §0 checkpoint: "an empty .test.ts runs").
import { expect, test } from "../support/fixtures.ts";

test("frozen clock is deterministic + advances explicitly", ({ clock }) => {
  expect(clock.now()).toBe(clock.frozenAt);
  clock.advance(1000);
  expect(clock.now()).toBe(clock.frozenAt + 1000);
});

test("seeded ids are deterministic + prefixed", ({ ids }) => {
  expect(ids.next("chat")).toBe("chat_000001");
  expect(ids.next()).toBe("id_000002");
});
