import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createOwnerWriteQueue } from "../../../../../packages/server/src/domain/connection/substrate/owner-queue.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("an owner's pending write serializes its reads without blocking another owner", async ({ ids }) => {
  const queue = createOwnerWriteQueue();
  const owner = castId<UserId>(ids.next("user"));
  const other = castId<UserId>(ids.next("user"));
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const order: string[] = [];
  const writing = queue(owner, async () => {
    order.push("write");
    entered.resolve();
    await release.promise;
    order.push("settled");
    return 7;
  });
  await entered.promise;
  const reading = queue(owner, () => {
    order.push("read");
    return Promise.resolve(8);
  });
  try {
    await expect(queue(other, () => Promise.resolve("other owner"))).resolves.toBe("other owner");
    expect(order).toEqual(["write"]);
  } finally {
    release.resolve();
  }
  await expect(writing).resolves.toBe(7);
  await expect(reading).resolves.toBe(8);
  expect(order).toEqual(["write", "settled", "read"]);
});

test("a refused write reaches its caller but neither poisons nor overtakes queued work", async ({ ids }) => {
  const queue = createOwnerWriteQueue();
  const owner = castId<UserId>(ids.next("user"));
  const failure = new Error("width probe refused");
  const release = Promise.withResolvers<void>();
  const first = queue(owner, async () => {
    await release.promise;
    throw failure;
  });
  const refused = expect(first).rejects.toBe(failure);
  const second = queue(owner, () => Promise.resolve("restored binding"));
  const third = queue(owner, () => Promise.resolve("next edit"));
  release.resolve();
  await refused;
  await expect(second).resolves.toBe("restored binding");
  await expect(third).resolves.toBe("next edit");
  await expect(queue(owner, () => Promise.resolve("fresh queue"))).resolves.toBe("fresh queue");
});
