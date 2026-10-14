export interface BusChannel<Key, Event> extends Disposable {
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
