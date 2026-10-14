// Domain-owned, live-only per-chat fanout after durable writes. Each graph owns its emitter; membership
// stays at the subscriber. A domain cannot import transport's channel engine (D18/D20, downward tiers).

import { EventEmitter, on } from "node:events";
import type { RpgBusEvent } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import type { RpgEventBus } from "./contract/bus.ts";

const channelFor = (chatId: ChatId): string => `rpg:${chatId}`;

// Process-local; unbounded listeners (one per connected device/member — many concurrent SSE streams).

// `on()` yields the raw emit-args array (`[event]`); EventEmitter is untyped, so the element is unwrapped and
// annotated at this single boundary (the `bus-channel.ts` liveEntries pattern).
async function* liveEntries(source: AsyncIterable<unknown[]>): AsyncGenerator<RpgBusEvent> {
  for await (const args of source) {
    yield args[0] as RpgBusEvent;
  }
}

/** Create the live bus of one application graph, without a second durable history. */
export function createRpgEventBus(): RpgEventBus {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  const lifetime = new AbortController();
  /** Publish an rpg-game live event to its `chatId` channel (the injected `EmitRpgEvent` op wires to this,
   *  `@orb/contracts/rpg`). Fire-and-forget — a dropped tick is healed by the client's reconnect blanket
   *  invalidate (LIVE-ONLY). Called by a verb/flush AFTER its durable write commits (compose wires it as the
   *  injected `RpgContext.emitBus`; the verbs/flush emit the five members — `bus-producer-coverage` holds it). */
  function publish(event: RpgBusEvent): void {
    if (!lifetime.signal.aborted) {
      emitter.emit(channelFor(event.chatId), event);
    }
  }

  /** The game's live event stream, scoped to one `chatId` and torn down on `signal` abort. `on()` begins
   *  buffering the instant it is called, so a subscriber loses no event in the attach gap. */
  function subscribe(chatId: ChatId, signal: AbortSignal): AsyncIterable<RpgBusEvent> {
    return liveEntries(on(emitter, channelFor(chatId), { signal: AbortSignal.any([signal, lifetime.signal]) }));
  }
  return {
    publishRpgEvent: publish,
    subscribeRpgEvents: subscribe,
    [Symbol.dispose](): void {
      lifetime.abort();
      emitter.removeAllListeners();
    },
  };
}

// biome-ignore lint/nursery/useDisposables: this module owns process compatibility lifetime; createServices uses separate graph owners, and module using would close it at import.
const processBus = createRpgEventBus();
export const publishRpgEvent: RpgEventBus["publishRpgEvent"] = processBus.publishRpgEvent;
export const subscribeRpgEvents: RpgEventBus["subscribeRpgEvents"] = processBus.subscribeRpgEvents;
