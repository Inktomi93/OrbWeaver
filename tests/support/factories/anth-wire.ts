// Test support: the ONE sanctioned place to shape `@anthropic-ai/sdk` wire fixtures for the anth-direct
// backend tests. The SDK's `RawMessageStreamEvent` / `Stream` are deep external unions; hand-building a
// fully-typed member per test is enormous, fragile bridging for a fixture whose RUNTIME shape is what the
// reducer reads. These builders route a plain wire-shaped object through ONE FABRICATION-OK cast (the
// `brand<C>()` pattern in resolved-connection.ts) so the ~30 per-test double-casts collapse to this file.

import type { Stream } from "@anthropic-ai/sdk/core/streaming";
import type { RawMessageStreamEvent } from "@anthropic-ai/sdk/resources/messages";

/** Shape a plain wire-object as a `RawMessageStreamEvent` — the SDK stream union is external + deep; the
 *  reducer reads only the runtime fields, so a structural literal is the honest fixture. */
export function anthEvent(event: Record<string, unknown>): RawMessageStreamEvent {
  // The SDK's RawMessageStreamEvent is an external deep union; the reducer reads the runtime shape only.
  // FABRICATION-OK: the ONE sanctioned cast for anth-direct wire fixtures (the resolved-connection brand pattern).
  return event as unknown as RawMessageStreamEvent;
}

/** Wrap an event array as a fake `Stream<RawMessageStreamEvent>` — the reducer only `for await`s it, so a
 *  plain async iterable over the events is a structurally-valid stream. */
export function anthStream(events: readonly RawMessageStreamEvent[]): Stream<RawMessageStreamEvent> {
  async function* gen(): AsyncGenerator<RawMessageStreamEvent> {
    await Promise.resolve();
    for (const event of events) {
      yield event;
    }
  }
  // The SDK `Stream` is a concrete class the reducer consumes only as an async iterable.
  // FABRICATION-OK: a generator is the honest test double (matches the openrouter runner's EventStream fake).
  return gen() as unknown as Stream<RawMessageStreamEvent>;
}
