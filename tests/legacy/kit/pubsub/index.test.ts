import type { PubSubHandler } from "@orb/kit/pubsub";
import { createPubSub } from "@orb/kit/pubsub";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

/** A dispatcher that records which handler received which event, in call order. */
function recordTo(calls: [PubSubHandler<string>, string][]): (handler: PubSubHandler<string>, event: string) => void {
  return (handler, event) => {
    calls.push([handler, event]);
  };
}

test("emit hands every current subscriber to the dispatcher exactly once, and never invokes a handler itself", () => {
  const calls: [PubSubHandler<string>, string][] = [];
  using bus = createPubSub<string>(recordTo(calls));
  const invoked: string[] = [];
  const first: PubSubHandler<string> = (event) => void invoked.push(`first:${event}`);
  const second: PubSubHandler<string> = (event) => void invoked.push(`second:${event}`);
  bus.subscribe(first);
  bus.subscribe(second);

  bus.emit("a");

  expect(calls).toEqual([
    [first, "a"],
    [second, "a"],
  ]);
  expect(invoked).toEqual([]);
});

test("a teardown removes only its own subscriber, and an emit with no subscribers dispatches nothing", () => {
  const calls: [PubSubHandler<string>, string][] = [];
  using bus = createPubSub<string>(recordTo(calls));
  const kept: PubSubHandler<string> = () => undefined;
  const removeDropped = bus.subscribe(() => undefined);
  bus.subscribe(kept);

  removeDropped();
  bus.emit("b");

  expect(calls).toEqual([[kept, "b"]]);

  const emptyCalls: [PubSubHandler<string>, string][] = [];
  using empty = createPubSub<string>(recordTo(emptyCalls));
  empty.emit("c");
  expect(emptyCalls).toEqual([]);
});
