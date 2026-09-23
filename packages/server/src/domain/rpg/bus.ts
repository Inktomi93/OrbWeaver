// domain/rpg/bus — the feature-root rpg bus RUNTIME (docs/plans/rpg/design.md). A LIVE-ONLY, self-healing,
// per-`chatId` event fan-out — it MIRRORS the per-user `transport/trpc/user-events-bus.ts` (NOT the durable
// `chat/bus.ts`): there is no durable table, no replay ring, no `chat_events`-style log. A domain verb emits
// AFTER its durable write commits; a subscriber attaches and goes live; the client gap-heals every (re)connect
// with a blanket invalidate. A dropped tick costs one refetch, so no durable log is warranted.
//
// WHY a DOMAIN-owned MODULE SINGLETON (not compose-minted, not transport's `defineBusChannel`):
//   • `defineBusChannel` lives in `transport/trpc/`, UP the tier ladder from `domain/` — a domain cannot
//     import it (§2 one-directional flow). So this is a domain-minted EventEmitter singleton, the buddy
//     domain-bus precedent (the G10/O4 exclusion — a domain live bus that never touches `bus-channel.ts`).
//   • It is a MODULE singleton (not a compose-built factory like `chat/bus.ts`) precisely BECAUSE it is
//     live-only with no durable half to thread through compose — the exact `user-events-bus.ts` posture: the
//     verbs `publishRpgEvent` after their durable write, the `rpg.stream` transport proc `subscribeRpgEvents`,
//     and nothing bridges a durable log in between. This is the `feature-structure` allowlist's `rpg/bus.ts`.
//
// KEYED BY `chatId`: every `RpgBusEvent` carries `chatId`, so a subscriber tails exactly the open game's
// channel (derived server-side from the request principal + membership, never client input — the
// `user-events-bus.ts` scope posture). Authz lives OUTSIDE this module: the `rpg.stream` proc gates every
// attach through chat membership (rpg authority derives `rpg_games.chatId → chat_participants`, D18/D20).

import { EventEmitter, on } from "node:events";
import type { RpgBusEvent } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";

const channelFor = (chatId: ChatId): string => `rpg:${chatId}`;

// Process-local; unbounded listeners (one per connected device/member — many concurrent SSE streams).
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

// `on()` yields the raw emit-args array (`[event]`); EventEmitter is untyped, so the element is unwrapped and
// annotated at this single boundary (the `bus-channel.ts` liveEntries pattern).
async function* liveEntries(source: AsyncIterable<unknown[]>): AsyncGenerator<RpgBusEvent> {
  for await (const args of source) {
    yield args[0] as RpgBusEvent;
  }
}

/** Publish an rpg-game live event to its `chatId` channel (the injected `EmitRpgEvent` op wires to this,
 *  `@orb/contracts/rpg`). Fire-and-forget — a dropped tick is healed by the client's reconnect blanket
 *  invalidate (LIVE-ONLY). Called by a verb/flush AFTER its durable write commits (compose wires it as the
 *  injected `RpgContext.emitBus`; the verbs/flush emit the five members — `bus-producer-coverage` holds it). */
export function publishRpgEvent(event: RpgBusEvent): void {
  emitter.emit(channelFor(event.chatId), event);
}

/** The game's live event stream, scoped to one `chatId` and torn down on `signal` abort. `on()` begins
 *  buffering the instant it is called, so a subscriber loses no event in the attach gap. */
export function subscribeRpgEvents(chatId: ChatId, signal: AbortSignal): AsyncIterable<RpgBusEvent> {
  return liveEntries(on(emitter, channelFor(chatId), { signal }));
}
