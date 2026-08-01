// @orb/contracts/rpg/actor — the actor ref + per-actor volatile (§2.6) + the R1 HAND OP union. Pins: the
// three ref arms parse, `actorRefKey` projects each, hp is born nullable, wallet is a STORED named-amount
// array, the volatile defaults fill the collection fields, and every op arm carries only its own field's
// datum (the op vocabulary is the plane's write surface — an arm that grew a foreign field would be a
// second image contract creeping back in).

import { actorRefKey, RPG_ACTOR_OP_FIELDS, rpgActorOpSchema, rpgActorRefSchema, rpgActorVolatileSchema } from "@orb/contracts/rpg";
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

// ── the R1 op vocabulary ──────────────────────────────────────────────────────────────────────────────────

test("every op arm parses, and an unknown op is REJECTED at the wire (the union is the whole vocabulary)", () => {
  const ops = [
    { op: "setStatus", status: "wary" },
    { op: "setHp", hp: { value: 9, max: 12 } },
    { op: "setHp", hp: null },
    { op: "setTracker", key: "trust", value: { value: 4 } },
    { op: "setTracker", key: "trust", value: { max: null } },
    { op: "addCondition", condition: { name: "Chilled" } },
    { op: "removeCondition", name: "Chilled" },
    { op: "addItem", item: { name: "Bone key" } },
    { op: "patchItem", id: "itm-1", patch: { quantity: 3 } },
    { op: "removeItem", id: "itm-1" },
    { op: "setWalletAmount", name: "gold", amount: 45 },
  ];
  for (const op of ops) {
    expect(rpgActorOpSchema.safeParse(op).success).toBe(true);
  }
  expect(rpgActorOpSchema.safeParse({ op: "setActorRef", actorRef: { kind: "cast", castKey: "x" } }).success).toBe(false);
  // An `addItem` without a name has no honest row to mint (the "Item 3" orphan the panel refuses too).
  expect(rpgActorOpSchema.safeParse({ op: "addItem", item: {} }).success).toBe(false);
});

test("an item's `id` is NOT authorable — identity is server-minted on both the hand and model paths", () => {
  const parsed = rpgActorOpSchema.parse({ op: "addItem", item: { name: "Rope", id: "itm-mine" } });
  expect(parsed.op === "addItem" && "id" in parsed.item).toBe(false);
});

test("the op FIELD vocabulary is the volatile plane's own writable keys (addressing excluded)", () => {
  expect([...RPG_ACTOR_OP_FIELDS].toSorted()).toEqual(
    Object.keys(rpgActorVolatileSchema.shape)
      .filter((key) => key !== "actorRef")
      .toSorted(),
  );
});
