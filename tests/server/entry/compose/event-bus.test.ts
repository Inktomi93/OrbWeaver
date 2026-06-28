// entry/compose/event-bus — the in-process typed domain-event bus. These pin the wiring shape the
// composition root relies on: emit delivers to a subscriber (the embeddings-indexer subscription seam), and
// a throwing subscriber is ISOLATED (logged, never propagated) so a failing handler can't break the
// emitting domain's write path (`emit` is a sync `void`).

import type { AssetCreatedEvent, CharacterUpdatedEvent, DomainEvent } from "@orb/contracts/events";
import type { AssetId, CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createDomainEventBus } from "@orb/server/entry/compose";
import { expect, test } from "vitest";

test("emit delivers the event to a subscribed handler (the indexer subscription shape)", async () => {
  const bus = createDomainEventBus();
  const seen: DomainEvent[] = [];
  bus.subscribe((received) => {
    seen.push(received);
  });

  const characterId = castId<CharacterId>("character_abc");
  const event: CharacterUpdatedEvent = { type: "character.updated", characterId };
  bus.emit(event);
  // emit is fire-and-forget — flush the microtask queue before asserting.
  await Promise.resolve();

  expect(seen).toHaveLength(1);
  expect(seen[0]).toEqual({ type: "character.updated", characterId });
});

test("a throwing subscriber is isolated — emit does not throw and other handlers still run", async () => {
  const bus = createDomainEventBus();
  const seen: string[] = [];
  bus.subscribe(() => {
    throw new Error("boom");
  });
  bus.subscribe((received) => {
    seen.push(received.type);
  });

  const event: AssetCreatedEvent = { type: "asset.created", assetId: castId<AssetId>("asset_1") };
  expect(() => bus.emit(event)).not.toThrow();
  await Promise.resolve();

  expect(seen).toEqual(["asset.created"]);
});
