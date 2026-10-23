// @subject tests/support/iso/ids.ts

import { createSeededIds, SEEDED_ID_MAX_CURSOR } from "../iso/ids.ts";
import { expect, test } from "./fixtures.ts";

test("restored business IDs continue the shared TypeID and opaque UUID sequence without replaying earlier identities", () => {
  const source = createSeededIds();
  const earlier = [source.next("persona"), source.uuid(), source.next("chat")];
  const cursor = source.snapshot();
  const expected = [source.next("persona"), source.uuid(), source.next("chat")];
  const restored = createSeededIds(cursor);
  expect([restored.next("persona"), restored.uuid(), restored.next("chat")]).toEqual(expected);
  expect(expected.every((id) => !earlier.includes(id))).toBe(true);
  restored.reset();
  expect([restored.next("persona"), restored.uuid(), restored.next("chat")]).toEqual(expected);
});

test("the original zero-seed reset repeats its sequence and an exhausted restored cursor refuses wraparound", () => {
  const source = createSeededIds();
  const first = source.next("chat");
  source.uuid();
  source.reset();
  expect(source.snapshot()).toBe(0);
  expect(source.next("chat")).toBe(first);
  const exhausted = createSeededIds(SEEDED_ID_MAX_CURSOR);
  expect(() => exhausted.next("chat")).toThrow("sequence is exhausted");
  expect(() => exhausted.uuid()).toThrow("sequence is exhausted");
  expect(exhausted.snapshot()).toBe(SEEDED_ID_MAX_CURSOR);
});
