import type { PubSubHandler } from "@orb/kit/pubsub";
import { createPubSub } from "@orb/kit/pubsub";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

/** A dispatcher that records which handler received which event, in call order. */
function recordingBus(): { readonly bus: ReturnType<typeof createPubSub<string>>; readonly calls: [PubSubHandler<string>, string][] } {
  const calls: [PubSubHandler<string>, string][] = [];
  const bus = createPubSub<string>((handler, event) => {
    calls.push([handler, event]);
  });
  return { bus, calls };
}

test("emit hands every current subscriber to the dispatcher exactly once, and never invokes a handler itself", () => {
  const { bus, calls } = recordingBus();
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
  const { bus, calls } = recordingBus();
  const kept: PubSubHandler<string> = () => undefined;
  const removeDropped = bus.subscribe(() => undefined);
  bus.subscribe(kept);

  removeDropped();
  bus.emit("b");

  expect(calls).toEqual([[kept, "b"]]);

  const empty = recordingBus();
  empty.bus.emit("c");
  expect(empty.calls).toEqual([]);
});
