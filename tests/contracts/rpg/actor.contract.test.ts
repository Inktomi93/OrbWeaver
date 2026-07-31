// @orb/contracts/rpg/actor — the actor ref + per-actor volatile (§2.6). Pins: the three ref arms parse,
// `actorRefKey` projects each, hp is born nullable, wallet is a STORED named-amount array, and the volatile
// defaults fill the collection fields.

import { actorRefKey, rpgActorRefSchema, rpgActorVolatileSchema } from "@orb/contracts/rpg";
import type { UserId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId, newId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures";

test("actor ref parses all three lite arms (character/user/cast)", () => {
  const characterId = mintTypeId(ID_PREFIX.character);
  const userId = newId<UserId>();
  expect(rpgActorRefSchema.safeParse({ kind: "character", characterId }).success).toBe(true);
  expect(rpgActorRefSchema.safeParse({ kind: "user", userId }).success).toBe(true);
  expect(rpgActorRefSchema.safeParse({ kind: "cast", castKey: "goblin-scout" }).success).toBe(true);
  expect(rpgActorRefSchema.safeParse({ kind: "npc", npcId: "x" }).success).toBe(false);
});

test("actorRefKey projects a stable distinct key per arm", () => {
  const characterId = mintTypeId(ID_PREFIX.character);
  expect(actorRefKey({ kind: "character", characterId })).toBe(`character:${characterId}`);
  expect(actorRefKey({ kind: "cast", castKey: "goblin" })).toBe("cast:goblin");
});

test("hp is born nullable (a null-hp actor has no health bar, §8)", () => {
  const parsed = rpgActorVolatileSchema.parse({ actorRef: { kind: "cast", castKey: "npc" }, hp: null });
  expect(parsed.hp).toBeNull();
  expect(parsed.trackerValues).toEqual({});
  expect(parsed.inventory).toEqual([]);
  expect(parsed.wallet).toEqual([]);
});

test("wallet is a STORED named-amount array (the lite-first divergence from the derived legacy wallet)", () => {
  const parsed = rpgActorVolatileSchema.parse({
    actorRef: { kind: "cast", castKey: "merchant" },
    hp: null,
    wallet: [
      { name: "gold", amount: 40 },
      { name: "silver", amount: 3 },
    ],
  });
  expect(parsed.wallet).toEqual([
    { name: "gold", amount: 40 },
    { name: "silver", amount: 3 },
  ]);
});
