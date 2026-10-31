// A scene-only NPC is addressed by the `npc` arm. The retired `cast` arm is refused at parse, so a stored actor row
// that still spells it cannot be read back as a different actor.
import { actorRefKey, rpgActorEntrySchema, rpgActorRefSchema } from "@orb/contracts/rpg";
import { brandedId, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";

const SLUG = "sister-vesna";

test("the retired cast arm is refused while every live arm parses and projects its own key", ({ ids }) => {
  expect(rpgActorRefSchema.safeParse({ kind: "cast", castKey: SLUG }).success).toBe(false);

  const characterId = mintTypeId("character", ids.next);
  const userId = brandedId("UserId").parse(ids.uuid());
  const live = [
    { ref: { kind: "npc", npcKey: SLUG }, key: `npc:${SLUG}` },
    { ref: { kind: "character", characterId }, key: `character:${characterId}` },
    { ref: { kind: "user", userId }, key: `user:${userId}` },
  ] as const;
  for (const { ref, key } of live) {
    expect(actorRefKey(rpgActorRefSchema.parse(ref))).toBe(key);
  }
});

test("an actor row stored under the retired cast spelling is refused whole, not defaulted into another actor", () => {
  const identity = { name: "Sister Vesna", emoji: "", mood: "", appearance: "", outfit: "", thoughts: "", relationship: { kind: "neutral", label: "" } };
  const volatile = { trackerValues: {}, conditions: [], inventory: [], wallet: [], status: "wary" };
  expect(rpgActorEntrySchema.safeParse({ actorRef: { kind: "cast", castKey: SLUG }, identity, volatile }).success).toBe(false);
  expect(rpgActorEntrySchema.safeParse({ actorRef: { kind: "npc", npcKey: SLUG }, identity, volatile }).success).toBe(true);
});
