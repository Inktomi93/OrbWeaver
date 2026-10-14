import { createPubSub } from "@orb/kit/pubsub";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("disposal clears the current subscribers and permanently refuses registration", async () => {
  const delivered: string[] = [];
  const pending: Promise<void>[] = [];
  using bus = createPubSub<string>((handler, event) => {
    pending.push(Promise.resolve(handler(event)));
  });
  const unsubscribe = bus.subscribe((event) => {
    delivered.push(event);
  });
  bus.emit("before");
  bus[Symbol.dispose]();
  bus.emit("after");
  unsubscribe();
  await Promise.all(pending);
  expect(delivered).toEqual(["before"]);
  expect(() => bus.subscribe(() => undefined)).toThrow("disposed pubsub engine");
});
