// The ONE transport EventEmitter home (client-architecture-state-and-gates.md §13/§16 G10). chat/user/notifications
// hand-rolled identical machinery three times — module-scope EventEmitter + setMaxListeners(0) + a per-key
// channel string + on(emitter, channel, {signal}) + the untyped-args unwrap generator. This mint is that
// machinery, once. Durability (chat/notifications' durable-first INSERT) stays PER-BUS POLICY, composed
// OUTSIDE `publish` by each bus's caller — the mint carries no opinion about what runs before it.
//
// `subscribeAll` is a TYPED OPT-IN: pass `firehose: true` to get it in the returned shape at all — a channel
// that doesn't opt in (user/notifications) has no `subscribeAll` member in its TYPE, not just an unwired one
// (G10 excludes buddy's domain-minted replay-buffer bus — O4 — which never touches this file).
import { EventEmitter, on } from "node:events";

export interface BusChannel<Key, Event> {
  /** Fan `event` to `key`'s channel (+ the firehose channel, if this bus declared one). */
  readonly publish: (key: Key, event: Event) => void;
  /** `key`'s live stream, torn down on `signal` abort. `on()` starts buffering the instant it's called, so a
   *  caller invoking this before a durable replay loses no event in the gap. */
  readonly subscribe: (key: Key, signal: AbortSignal) => AsyncIterable<Event>;
}

export interface FirehoseBusChannel<Key, Event> extends BusChannel<Key, Event> {
  /** Every event across every key, regardless of channel — the buddy-observer-shaped tap. Callback-style: the
   *  one caller today is a long-lived process supervisor, not a per-request SSE generator. Returns the
   *  unsubscribe. */
  readonly subscribeAll: (listener: (event: Event) => void) => () => void;
}

// `on()` yields the raw emit-args array (`[event]`); EventEmitter is untyped, so the element is unwrapped and
// annotated at this single boundary.
async function* liveEntries<Event>(source: AsyncIterable<unknown[]>): AsyncGenerator<Event> {
  for await (const args of source) {
    yield args[0] as Event;
  }
}

export function defineBusChannel<Key extends string | number, Event>(channelFor: (key: Key) => string): BusChannel<Key, Event>;
export function defineBusChannel<Key extends string | number, Event>(
  channelFor: (key: Key) => string,
  opts: { readonly firehose: true },
): FirehoseBusChannel<Key, Event>;
export function defineBusChannel<Key extends string | number, Event>(
  channelFor: (key: Key) => string,
  opts?: { readonly firehose: true },
): BusChannel<Key, Event> | FirehoseBusChannel<Key, Event> {
  // Process-local; unbounded listeners (one per connected device/member — many concurrent SSE streams).
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  const allChannel = "*";

  const base: BusChannel<Key, Event> = {
    publish: (key, event) => {
      emitter.emit(channelFor(key), event);
      if (opts?.firehose === true) {
        emitter.emit(allChannel, event);
      }
    },
    subscribe: (key, signal) => liveEntries<Event>(on(emitter, channelFor(key), { signal })),
  };

  if (opts?.firehose !== true) {
    return base;
  }
  return {
    ...base,
    subscribeAll: (listener) => {
      emitter.on(allChannel, listener);
      return () => {
        emitter.off(allChannel, listener);
      };
    },
  };
}
