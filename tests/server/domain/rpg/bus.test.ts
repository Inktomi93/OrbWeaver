// domain/rpg/bus — the feature-root rpg bus RUNTIME (rpg-design/05 §4.9). A LIVE-ONLY per-chatId fan-out
// mirroring `user-events-bus.ts`. Pins: a subscriber attached BEFORE a publish receives it (the `on()`-buffers-
// from-attach property), events are SCOPED to their `chatId` channel (a subscriber never sees another chat's
// events), and an aborted signal tears the stream down.

import type { RpgBusEvent } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { publishRpgEvent, subscribeRpgEvents } from "../../../../packages/server/src/domain/rpg/index.ts";
import { expect, test } from "../../../support/fixtures.ts";

const chatA = castId<ChatId>("chat_a");
const chatB = castId<ChatId>("chat_b");

/** Drain up to `n` events from a live stream, or stop when `signal` aborts. */
async function drain(stream: AsyncIterable<RpgBusEvent>, n: number): Promise<RpgBusEvent[]> {
  const out: RpgBusEvent[] = [];
  for await (const event of stream) {
    out.push(event);
    if (out.length >= n) {
      break;
    }
  }
  return out;
}

test("a subscriber receives an event published to its chat channel", async () => {
  const ac = new AbortController();
  const stream = subscribeRpgEvents(chatA, ac.signal);
  const collected = drain(stream, 1);
  // Publish AFTER attach — `on()` began buffering at the subscribe call, so the event is not lost.
  publishRpgEvent({ type: "gameChanged", chatId: chatA });
  const events = await collected;
  ac.abort();
  expect(events).toEqual([{ type: "gameChanged", chatId: chatA }]);
});

test("events are scoped to their chatId — a subscriber never sees another chat's events", async () => {
  const acA = new AbortController();
  const acB = new AbortController();
  const streamA = subscribeRpgEvents(chatA, acA.signal);
  const collectedA = drain(streamA, 1);

  // Fire chat B's event FIRST (chat A's subscriber must not pick it up), then chat A's.
  publishRpgEvent({ type: "gameChanged", chatId: chatB });
  publishRpgEvent({ type: "snapshotPatched", chatId: chatA, snapshotId: castId("rpg_snapshot_1") });

  const eventsA = await collectedA;
  acA.abort();
  acB.abort();
  // The FIRST (and only) event chat A's subscriber sees is chat A's — chat B's never reached this channel.
  expect(eventsA).toEqual([{ type: "snapshotPatched", chatId: chatA, snapshotId: castId("rpg_snapshot_1") }]);
});

test("an aborted signal ends the stream", async () => {
  const ac = new AbortController();
  const stream = subscribeRpgEvents(chatA, ac.signal);
  ac.abort();
  const events: RpgBusEvent[] = [];
  try {
    for await (const event of stream) {
      events.push(event);
    }
  } catch {
    // node:events `on()` throws an AbortError on an already-aborted signal — the stream is torn down, which
    // is the property under test (no events delivered).
  }
  expect(events).toEqual([]);
});
