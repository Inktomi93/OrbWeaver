import { createSerialLanes } from "@orb/kit/serial-lanes";
import { expect, test } from "@orb/testkit/node";

test("two jobs on the SAME key never overlap — the second starts only after the first settles", async () => {
  const lanes = createSerialLanes();
  const gate = Promise.withResolvers<void>();
  const order: string[] = [];
  const first = lanes.run("same", async () => {
    order.push("a:enter");
    await gate.promise;
    order.push("a:exit");
  });
  const second = lanes.run("same", () => {
    order.push("b:enter");
    return Promise.resolve();
  });
  try {
    await Promise.resolve();
    expect(order).toEqual(["a:enter"]);
  } finally {
    gate.resolve();
    await Promise.all([first, second]);
  }
  expect(order).toEqual(["a:enter", "a:exit", "b:enter"]);
});

test("jobs on DIFFERENT keys run in parallel — the key IS the serialization scope", async () => {
  const lanes = createSerialLanes();
  const gate = Promise.withResolvers<void>();
  const order: string[] = [];
  const held = lanes.run("chat:one", async () => {
    order.push("one:enter");
    await gate.promise;
  });
  try {
    await lanes.run("chat:two", () => {
      order.push("two:ran");
      return Promise.resolve();
    });
    expect(order).toEqual(["one:enter", "two:ran"]);
  } finally {
    gate.resolve();
    await held;
  }
});

test("a REJECTING job surfaces to its own caller and does not become the next job's failure", async () => {
  const lanes = createSerialLanes();
  const failure = new Error("job blew up");
  await expect(lanes.run("failing", () => Promise.reject(failure))).rejects.toBe(failure);
  await expect(lanes.run("failing", () => Promise.resolve("ran anyway"))).resolves.toBe("ran anyway");
});

test("a drained lane is DELETED — the Map is bounded by active keys, not by every key ever used", async () => {
  const lanes = createSerialLanes();
  const before = lanes.activeCount();
  const gate = Promise.withResolvers<void>();
  const held = lanes.run("drains", () => gate.promise);
  try {
    expect(lanes.activeCount()).toBe(before + 1);
  } finally {
    gate.resolve();
    await held;
  }
  await Promise.resolve();
  await Promise.resolve();
  expect(lanes.activeCount()).toBe(before);
});
