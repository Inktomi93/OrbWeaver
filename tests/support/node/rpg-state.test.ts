// @subject tests/support/iso/rpg-state.ts

import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso/ids.ts";
import {
  makeRpgActorEntry,
  makeRpgActorIdentity,
  makeRpgActorVolatile,
  makeRpgInventoryItem,
  makeRpgRelationship,
  makeRpgSheet,
  makeRpgTrackerValue,
} from "@orb/testkit/iso/rpg-state.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("whole actor defaults retain the supplied reference without sharing mutable inventory", () => {
  const seeded = createSeededIds();
  const ids = createIdSource(seeded.next);
  const ref = { kind: "character", characterId: ids.typeId(ID_PREFIX.character) } as const;
  const first = makeRpgActorEntry(ref);
  const next = makeRpgActorEntry(ref);
  first.volatile.inventory.push(makeRpgInventoryItem({ id: seeded.uuid(), name: "Token" }));
  expect(first.actorRef).toEqual(ref);
  expect(first.volatile.inventory).toHaveLength(1);
  expect(next.volatile.inventory).toEqual([]);
});

test("component construction preserves owner refusals after overrides", () => {
  const itemId = createSeededIds().uuid();
  expect(() => makeRpgSheet({ level: -1 })).toThrow();
  expect(() => makeRpgActorVolatile({ wallet: [{ name: "Coin", amount: 0.5 }] })).toThrow();
  expect(() => makeRpgRelationship({ label: "Custom", kind: "custom" })).not.toThrow();
  expect(() => makeRpgTrackerValue({ max: 0 })).toThrow();
  expect(() => makeRpgActorIdentity("")).toThrow();
  expect(() => makeRpgActorEntry({ kind: "npc", npcKey: "Not a canonical key" })).toThrow();
  expect(() => makeRpgInventoryItem({ id: "", name: "Token" })).toThrow();
  expect(() => makeRpgInventoryItem({ id: itemId, name: "Token", quantity: 0 })).toThrow();
});
