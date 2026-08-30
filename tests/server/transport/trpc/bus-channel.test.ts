// transport/trpc/bus-channel — the ONE transport EventEmitter mint every live bus rides (chat, user,
// notifications, automation). Four properties, and every bus above inherits whichever it gets wrong:
// per-KEY isolation (a subscriber to A never sees B's events — the leak this machinery exists to make
// impossible), buffering from the instant `subscribe` is called (which is what lets a durable-first bus
// replay history without losing the live gap), the FIREHOSE as a typed opt-in (absent from the returned
// shape unless declared), and teardown on the abort signal.
//
// Pure module test over the process-local emitter: no db, no clock, no I/O.

import { describe, vi } from "vitest";
// Deep-imported: the mint is internal to the transport buses and not on the trpc front door.
import { defineBusChannel } from "../../../../packages/server/src/transport/trpc/bus-channel.ts";
import { expect, test } from "../../../support/fixtures.ts";

interface Ping {
  readonly key: string;
  readonly n: number;
}

const channelFor = (key: string): string => `ping:${key}`;

/** Read the next event off a live stream — `on()` already buffered anything published after subscribe. */
async function next(stream: AsyncIterable<Ping>): Promise<Ping> {
  for await (const event of stream) {
    return event;
  }
  throw new Error("stream ended without yielding");
}

/** Drain everything currently buffered, then stop by aborting — the "what did this key receive" read. */
async function drain(stream: AsyncIterable<Ping>, abort: AbortController, expected: number): Promise<Ping[]> {
  const seen: Ping[] = [];
  if (expected === 0) {
    abort.abort();
    return seen;
  }
  for await (const event of stream) {
    seen.push(event);
    if (seen.length === expected) {
      abort.abort();
      break;
    }
  }
  return seen;
}

describe("bus-channel — per-key isolation", () => {
  test("an event published to key A reaches A's stream and NEVER B's", async () => {
    const bus = defineBusChannel<string, Ping>(channelFor);
    const abortA = new AbortController();
    const abortB = new AbortController();
    const streamA = bus.subscribe("a", abortA.signal);
    const streamB = bus.subscribe("b", abortB.signal);

    bus.publish("a", { key: "a", n: 1 });
    // POSITIVE CONTROL for B's silence: B's own key does deliver, so an empty B above is the CHANNEL
    // KEY working and not a dead subscription.
    bus.publish("b", { key: "b", n: 2 });

    await expect(next(streamA)).resolves.toStrictEqual({ key: "a", n: 1 });
    await expect(next(streamB)).resolves.toStrictEqual({ key: "b", n: 2 });
    abortA.abort();
    abortB.abort();
  });

  test("delivery is ordered and buffered from the instant subscribe was called", async () => {
    const bus = defineBusChannel<string, Ping>(channelFor);
    const abort = new AbortController();
    const stream = bus.subscribe("a", abort.signal);

    bus.publish("a", { key: "a", n: 1 });
    bus.publish("a", { key: "a", n: 2 });
    bus.publish("a", { key: "a", n: 3 });

    await expect(drain(stream, abort, 3)).resolves.toStrictEqual([
      { key: "a", n: 1 },
      { key: "a", n: 2 },
      { key: "a", n: 3 },
    ]);
  });

  test("an event published BEFORE anyone subscribed is gone — the bus is live-only, never a log", async () => {
    const bus = defineBusChannel<string, Ping>(channelFor);
    bus.publish("a", { key: "a", n: 0 });

    const abort = new AbortController();
    const stream = bus.subscribe("a", abort.signal);
    bus.publish("a", { key: "a", n: 1 });

    await expect(next(stream)).resolves.toStrictEqual({ key: "a", n: 1 });
    abort.abort();
  });

  // MEASURED, not assumed: node's `events.on(…, { signal })` TERMINATES an aborted stream by THROWING
  // `ABORT_ERR` into the consumer, it does not end it quietly. Pinned in that shape because a room pump
  // that treats teardown as a normal `return` would swallow nothing and a pump that lets the throw escape
  // its error wrapper turns a client disconnect into a socket-level fault.
  test("aborting the signal terminates the stream (ABORT_ERR) rather than hanging the consumer", async () => {
    const bus = defineBusChannel<string, Ping>(channelFor);
    const abort = new AbortController();
    const stream = bus.subscribe("a", abort.signal);

    abort.abort();

    await expect(next(stream)).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("bus-channel — the firehose is a declared opt-in", () => {
  test("a firehose channel taps EVERY key, and its unsubscribe stops delivery", () => {
    const bus = defineBusChannel<string, Ping>(channelFor, { firehose: true });
    const listener = vi.fn();

    const off = bus.subscribeAll(listener);
    bus.publish("a", { key: "a", n: 1 });
    bus.publish("b", { key: "b", n: 2 });
    off();
    bus.publish("a", { key: "a", n: 3 });

    expect(listener.mock.calls.map(([event]) => event)).toStrictEqual([
      { key: "a", n: 1 },
      { key: "b", n: 2 },
    ]);
  });

  test("a channel that did not opt in has NO subscribeAll member at all (the G10 typed opt-in)", () => {
    const plain = defineBusChannel<string, Ping>(channelFor);

    expect("subscribeAll" in plain).toBe(false);
  });

  test("the firehose fan does not double-deliver to the key's own subscriber", async () => {
    const bus = defineBusChannel<string, Ping>(channelFor, { firehose: true });
    const abort = new AbortController();
    const stream = bus.subscribe("a", abort.signal);
    const listener = vi.fn();
    bus.subscribeAll(listener);

    bus.publish("a", { key: "a", n: 1 });
    bus.publish("a", { key: "a", n: 2 });

    await expect(drain(stream, abort, 2)).resolves.toHaveLength(2);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
