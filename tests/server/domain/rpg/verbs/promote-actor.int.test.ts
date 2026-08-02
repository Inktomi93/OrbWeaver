// verbs/promote-actor — promoteActor (the actor-state review §4.3 / R4). THE promotion doorway, and
// `dismissActor`'s opposite: dismissal forgets a known character, promotion keeps her forever.
//
// WHAT THESE TESTS EXIST TO PIN. A re-key is the easiest kind of change to ship half-done, because the halves
// it forgets are invisible: an actor's key is addressed from THREE places (the state row, the scene presence
// list, and every hand LOCK path under it), and a promotion that moved only the first would silently hand the
// model back every field the host had frozen — at the exact moment the host was rewarding the character. So
// the survival test asserts all three at the db row through the real verb, not the verb's return value.
//
// The second class is the name COLLISION. The model addresses actors by NAME (`buildRosterRefIndex` is a
// lowercased name→ref Map), so a second roster "Vesna" makes one of them unaddressable by every tool write.
// That refusal is the reason promotion asks the host to rename first instead of quietly minting a shadow.

import type { Db } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { beforeEach } from "vitest";
import type { RpgGameRow } from "../../../../../packages/server/src/domain/rpg/contract/service";
import { findGameByChat } from "../../../../../packages/server/src/domain/rpg/persistence/games";
import { resolveSnapshotForTurn } from "../../../../../packages/server/src/domain/rpg/persistence/snapshots";
import { freshDb } from "../../../../support/db";
import { expect, makeRpgService, principal, rosterUser, seedChat, test } from "../_support";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

const VESNA = { kind: "cast", castKey: "vesna" } as const;
const HOST = principal("host");

async function seedGame(): Promise<{
  chatId: ChatId;
  game: RpgGameRow;
  service: ReturnType<typeof makeRpgService>["service"];
  fakes: ReturnType<typeof makeRpgService>["fakes"];
}> {
  const chatId = await seedChat(db, "a");
  const h = makeRpgService(db, { roster: [rosterUser("host", "Nate")] });
  h.fakes.membership.set("user_host", "host");
  await h.service.createGame({ principal: HOST, chatId, mode: "lite" });
  const game = await findGameByChat(db, chatId);
  if (!game) {
    throw new Error("no game");
  }
  return { chatId, game, service: h.service, fakes: h.fakes };
}

/** Put Vesna on stage with an identity the story wrote and tracked state the host hand-pinned — the shape a
 *  real promotion candidate has after an acquaintance. */
async function seedVesna(service: ReturnType<typeof makeRpgService>["service"], chatId: ChatId): Promise<void> {
  await service.editSnapshot({ principal: HOST, chatId, patch: { presentCharacters: ["cast:vesna"] } });
  await service.patchActor({
    principal: HOST,
    chatId,
    targetRef: VESNA,
    ops: [
      { op: "setIdentityText", field: "name", text: "Sister Vesna" },
      { op: "setIdentityText", field: "appearance", text: "Ash-grey habit, a burn scar down one wrist." },
      { op: "setIdentityText", field: "thoughts", text: "She is counting the exits." },
      { op: "setIdentityText", field: "mood", text: "guarded" },
      { op: "setRelationship", relationship: { kind: "ally", label: "" } },
      { op: "setStatus", status: "limping" },
      { op: "setTracker", key: "trust", value: { value: 4 } },
      { op: "addCondition", condition: { name: "Bleeding" } },
      { op: "addItem", item: { name: "Prayer beads" } },
      { op: "setWalletAmount", name: "gold", amount: 12 },
    ],
  });
}

test("the re-key carries the WHOLE person across: state row, scene presence, and every hand pin", async () => {
  const { chatId, game, service, fakes } = await seedGame();
  await seedVesna(service, chatId);
  const before = await resolveSnapshotForTurn(db, { id: game.id, chatId });
  // The pins the host stamped under her CAST key — the half a naive re-key drops.
  expect(before?.fieldLocks?.["actorState.cast:vesna.volatile.status"]).toBe(true);
  expect(before?.fieldLocks?.["actorState.cast:vesna.volatile.trackerValues.trust"]).toBe(true);

  expect(await service.promoteActor({ principal: HOST, chatId, targetRef: VESNA })).toStrictEqual({ ok: true });

  // The id the promotion minted — read off the RECORDER, never a hand-written stand-in: the re-keyed ref
  // crosses the snapshot write boundary, which validates the id SHAPE, so a readable fake id would fail there
  // for a reason that has nothing to do with promotion (it did, on the first run of this test).
  const characterId = fakes.promoteMints[0]?.characterId;
  const promotedKey = `character:${characterId}`;

  const after = await resolveSnapshotForTurn(db, { id: game.id, chatId });
  const rows = after?.actorState ?? [];
  // ONE row, re-keyed in place — never a second person beside the first.
  expect(rows).toHaveLength(1);
  const moved = rows[0];
  expect(moved?.actorRef).toEqual({ kind: "character", characterId });
  // Every volatile plane arrives intact. This is the assertion the whole verb exists for.
  expect(moved?.volatile.status).toBe("limping");
  expect(moved?.volatile.trackerValues["trust"]?.value).toBe(4);
  expect(moved?.volatile.conditions.map((c) => c.name)).toEqual(["Bleeding"]);
  expect(moved?.volatile.inventory.map((i) => i.name)).toEqual(["Prayer beads"]);
  expect(moved?.volatile.wallet).toEqual([{ name: "gold", amount: 12 }]);
  // The identity half is GONE by design (a roster actor carries none) — its durable content went to the card.
  expect(moved?.identity).toBeUndefined();
  // Presence follows her: she is still standing in the scene, under the new key.
  expect(after?.presentCharacters).toEqual([promotedKey]);
  // The pins are RE-BASED, not released: the host froze those fields, and promotion is not consent to unfreeze.
  expect(after?.fieldLocks?.[`actorState.${promotedKey}.volatile.status`]).toBe(true);
  expect(after?.fieldLocks?.[`actorState.${promotedKey}.volatile.trackerValues.trust`]).toBe(true);
  expect(after?.fieldLocks?.["actorState.cast:vesna.volatile.status"]).toBeUndefined();
  // The identity pins go with the identity half — a pin on a field that no longer exists is a trap with no
  // Release affordance attached to anything.
  expect(after?.fieldLocks?.["actorState.cast:vesna.identity.mood"]).toBeUndefined();

  // The panel re-resolves (§4.9) and the mint fired UNDER THE HOST with the card content the verb derived.
  expect(fakes.busEvents.at(-1)).toMatchObject({ type: "snapshotPatched", chatId });
  expect(fakes.promoteMints).toHaveLength(1);
  // The handle follows her CURRENT display name (`sister-vesna`), NOT the stale `vesna` key she was minted
  // under — a story that renamed an NPC must not hand her a card filed under the old spelling. The slug key is
  // an address, the name is the identity, and this is the seam where they are allowed to disagree.
  expect(fakes.promoteMints[0]).toMatchObject({ chatId, hostUserId: "user_host", name: "Sister Vesna", handle: "sister-vesna" });
  // THE IDENTITY CARRY: the standing guides the story spent the acquaintance writing are the card's prose.
  // `mood` is deliberately absent (a per-beat observation, not a standing fact).
  const description = fakes.promoteMints[0]?.description ?? "";
  expect(description).toContain("Ash-grey habit");
  expect(description).toContain("counting the exits");
  expect(description).not.toContain("guarded");
});

test("the promoted actor is projected as a ROSTER member carrying her state — not as a cast NPC, and not twice", async () => {
  const { chatId, service } = await seedGame();
  await seedVesna(service, chatId);
  await service.promoteActor({ principal: HOST, chatId, targetRef: VESNA });

  const view = await service.getTrackerView({ principal: HOST, chatId });
  const vesna = view.actors.filter((a) => a.name === "Sister Vesna");
  expect(vesna).toHaveLength(1);
  expect(vesna[0]?.actorRef.kind).toBe("character");
  // A roster actor's identity half is null by construction — the panel reads her name off the roster/card now.
  expect(vesna[0]?.identity).toBeNull();
  expect(vesna[0]?.presence).toBe(true);
  expect(vesna[0]?.volatile?.status).toBe("limping");
  // And she is no longer a cast actor at all — the Scene tab's cast list is `kind === "cast"`.
  expect(view.actors.some((a) => a.actorRef.kind === "cast")).toBe(false);
});

test("a NAME the chat roster already carries is REFUSED as data — no card, no seat, no write", async () => {
  const { chatId, game, service, fakes } = await seedGame();
  await seedVesna(service, chatId);
  // A roster human already answers to the same name: the model's name→ref index cannot hold both.
  fakes.roster.push(rosterUser("other", "sister vesna"));
  const slotsBefore = fakes.narratorPosts.length;

  const refused = await service.promoteActor({ principal: HOST, chatId, targetRef: VESNA });
  expect(refused.ok).toBe(false);
  expect(refused.ok === false && refused.reason).toContain("already on this chat's roster");

  // Nothing durable and nothing snapshot-shaped happened — the gate runs BEFORE the mint on purpose.
  expect(fakes.promoteMints).toHaveLength(0);
  expect(fakes.narratorPosts).toHaveLength(slotsBefore);
  const after = await resolveSnapshotForTurn(db, { id: game.id, chatId });
  expect(after?.actorState.map((a) => (a.actorRef.kind === "cast" ? a.actorRef.castKey : ""))).toEqual(["vesna"]);
});

test("promoting an actor the game does not track is ERRORS-AS-DATA — the mint never runs", async () => {
  const { chatId, service, fakes } = await seedGame();

  const refused = await service.promoteActor({ principal: HOST, chatId, targetRef: VESNA });
  expect(refused.ok).toBe(false);
  expect(refused.ok === false && refused.reason).toContain("cast:vesna");
  expect(fakes.promoteMints).toHaveLength(0);
});

test("a durable-half refusal (an exhausted card handle) leaves the actor exactly where she was", async () => {
  const { chatId, game, service, fakes } = await seedGame();
  await seedVesna(service, chatId);
  fakes.promoteRefusal = 'your character library already carries "vesna" and every variant this promotion tried';

  const refused = await service.promoteActor({ principal: HOST, chatId, targetRef: VESNA });
  expect(refused.ok).toBe(false);
  expect(refused.ok === false && refused.reason).toContain("character library");

  const after = await resolveSnapshotForTurn(db, { id: game.id, chatId });
  expect(after?.actorState[0]?.actorRef).toEqual(VESNA);
  expect(after?.actorState[0]?.identity?.name).toBe("Sister Vesna");
  expect(after?.presentCharacters).toEqual(["cast:vesna"]);
});

test("a promoted character is a normal roster actor afterwards: hand ops reach her, identity ops correctly refuse", async () => {
  const { chatId, game, service, fakes } = await seedGame();
  await seedVesna(service, chatId);
  await service.promoteActor({ principal: HOST, chatId, targetRef: VESNA });
  const characterId = fakes.promoteMints[0]?.characterId;
  if (characterId === undefined || characterId === null) {
    throw new Error("the promotion did not mint a character");
  }
  const promoted = { kind: "character", characterId } as const;

  // The volatile door still reaches her under the new key — the re-key did not orphan her from the ops.
  expect(await service.patchActor({ principal: HOST, chatId, targetRef: promoted, ops: [{ op: "setStatus", status: "healed" }] })).toStrictEqual({ ok: true });
  // …and the identity arms refuse, exactly as they do for every other roster member (her name is the card's).
  const refused = await service.patchActor({ principal: HOST, chatId, targetRef: promoted, ops: [{ op: "setIdentityText", field: "mood", text: "calm" }] });
  expect(refused.ok).toBe(false);
  expect(refused.ok === false && refused.reason).toContain("carries no identity of its own");

  const after = await resolveSnapshotForTurn(db, { id: game.id, chatId });
  expect(after?.actorState[0]?.volatile.status).toBe("healed");
});
