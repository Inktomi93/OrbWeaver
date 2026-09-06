// verbs/promote-actor — promoteActor (the actor-state review §4.3 / R4). THE promotion doorway, and
// `dismissActor`'s opposite: dismissal forgets a known character, promotion keeps her forever.
//
// WHAT THESE TESTS EXIST TO PIN. A re-key is the easiest kind of change to ship half-done, because the halves
// it forgets are invisible: an actor's key is addressed from THREE places (the state row, the scene presence
// list, and every hand LOCK path under it), and a promotion that moved only the first would silently hand the
// model back every field the host had frozen — at the exact moment the host was rewarding the character. So
// the survival test asserts all three at the db row through the real verb, not the verb's return value.
//
// The second class is the name COLLISION. The model addresses actors by NAME (`buildActorRefIndex` is a
// lowercased name→ref Map), so a second roster "Vesna" makes one of them unaddressable by every tool write.
// That refusal is the reason promotion asks the host to rename first instead of quietly minting a shadow.

import { createCharacterSchema } from "@orb/contracts/character";
import { clampActorCardName, rpgNpcSlug } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import type { ChatId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { slugifyHandle } from "@orb/kit/slug";
import { sql } from "drizzle-orm";
import { beforeEach } from "vitest";
import type { RpgGameRow } from "../../../../../packages/server/src/domain/rpg/contract/service.ts";
import { findGameByChat } from "../../../../../packages/server/src/domain/rpg/persistence/games.ts";
import { resolveSnapshotForTurn } from "../../../../../packages/server/src/domain/rpg/persistence/snapshots.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, makeRpgService, participantUser, principal, seedChat, test } from "../_support.ts";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

const VESNA = { kind: "npc", npcKey: "vesna" } as const;
const HOST = principal(castId<Handle>("host"));

async function seedGame(): Promise<{
  chatId: ChatId;
  game: RpgGameRow;
  service: ReturnType<typeof makeRpgService>["service"];
  fakes: ReturnType<typeof makeRpgService>["fakes"];
}> {
  const chatId = await seedChat(db, "a");
  const h = makeRpgService(db, { participants: [participantUser(castId<Handle>("host"), "Alex")] });
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
  await service.editSnapshot({ principal: HOST, chatId, patch: { presentCharacters: ["npc:vesna"] } });
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
  expect(before?.fieldLocks?.["actorState.npc:vesna.volatile.status"]).toBe(true);
  expect(before?.fieldLocks?.["actorState.npc:vesna.volatile.trackerValues.trust"]).toBe(true);

  expect(await service.promoteActor({ principal: HOST, chatId, targetRef: VESNA })).toStrictEqual({ ok: true, issues: [] });

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
  expect(after?.fieldLocks?.["actorState.npc:vesna.volatile.status"]).toBeUndefined();
  // The identity pins go with the identity half — a pin on a field that no longer exists is a trap with no
  // Release affordance attached to anything.
  expect(after?.fieldLocks?.["actorState.npc:vesna.identity.mood"]).toBeUndefined();

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

test("the promoted actor is projected as a ROSTER member carrying her state — not as an npc, and not twice", async () => {
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
  // And she is no longer an npc at all — the Scene tab's npc list is `kind === "npc"`.
  expect(view.actors.some((a) => a.actorRef.kind === "npc")).toBe(false);
});

test("a NAME the chat roster already carries is REFUSED as data — no card, no seat, no write", async () => {
  const { chatId, game, service, fakes } = await seedGame();
  await seedVesna(service, chatId);
  // A roster human already answers to the same name: the model's name→ref index cannot hold both.
  fakes.participants.push(participantUser(castId<Handle>("other"), "sister vesna"));
  const slotsBefore = fakes.narratorPosts.length;

  const refused = await service.promoteActor({ principal: HOST, chatId, targetRef: VESNA });
  expect(refused.ok).toBe(false);
  expect(refused.ok === false && refused.reason).toContain("already on this chat's roster");

  // Nothing durable and nothing snapshot-shaped happened — the gate runs BEFORE the mint on purpose.
  expect(fakes.promoteMints).toHaveLength(0);
  expect(fakes.narratorPosts).toHaveLength(slotsBefore);
  const after = await resolveSnapshotForTurn(db, { id: game.id, chatId });
  expect(after?.actorState?.map((a) => (a.actorRef.kind === "npc" ? a.actorRef.npcKey : ""))).toEqual(["vesna"]);
});

test("promoting an actor the game does not track is ERRORS-AS-DATA — the mint never runs", async () => {
  const { chatId, service, fakes } = await seedGame();

  const refused = await service.promoteActor({ principal: HOST, chatId, targetRef: VESNA });
  expect(refused.ok).toBe(false);
  expect(refused.ok === false && refused.reason).toContain("npc:vesna");
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
  expect(after?.actorState?.[0]?.actorRef).toEqual(VESNA);
  expect(after?.actorState?.[0]?.identity?.name).toBe("Sister Vesna");
  expect(after?.presentCharacters).toEqual(["npc:vesna"]);
});

test("#723 retry after the card and seat land reuses them, then completes the actor re-key", async () => {
  const { chatId, game, service, fakes } = await seedGame();
  await seedVesna(service, chatId);
  await db.run(
    sql.raw("CREATE TRIGGER fail_promotion_rekey BEFORE INSERT ON rpg_snapshots BEGIN SELECT RAISE(ABORT, 'injected actor rekey interruption'); END"),
  );

  await expect(service.promoteActor({ principal: HOST, chatId, targetRef: VESNA })).rejects.toThrow();
  expect(fakes.promoteMints).toHaveLength(1);
  expect(fakes.participants.filter((actor) => actor.name === "Sister Vesna")).toHaveLength(1);
  expect((await resolveSnapshotForTurn(db, { id: game.id, chatId }))?.actorState?.[0]?.actorRef).toEqual(VESNA);

  await db.run(sql.raw("DROP TRIGGER fail_promotion_rekey"));
  await expect(service.promoteActor({ principal: HOST, chatId, targetRef: VESNA })).resolves.toEqual({ ok: true, issues: [] });
  expect(fakes.promoteMints).toHaveLength(1);
  expect(fakes.participants.filter((actor) => actor.name === "Sister Vesna")).toHaveLength(1);
  expect((await resolveSnapshotForTurn(db, { id: game.id, chatId }))?.actorState?.[0]?.actorRef.kind).toBe("character");
});

// ── #1386: the card HANDLE is the character namespace's, so it is minted by that namespace's engine ──────
// `rpgNpcSlug` is the ACTOR-KEY engine (never merge two people: NFC-preserving, marks kept, never
// truncated). A character handle answers to different law — the per-owner `characters_owner_handle_unique`
// index and the 200-char wire cap — and `slugifyHandle` is its one home. Minting the handle with the actor
// engine let a model-authored NPC name (`rpgActorIdentitySchema.name` has NO max) produce a handle the
// character namespace's own create schema refuses.

/** Put an npc on stage under her canonical key with the display name the story wrote. */
async function seedCastActor(service: ReturnType<typeof makeRpgService>["service"], chatId: ChatId, names: readonly string[]): Promise<readonly string[]> {
  const keys = names.map((name) => rpgNpcSlug(name));
  await service.editSnapshot({ principal: HOST, chatId, patch: { presentCharacters: keys.map((key) => `npc:${key}`) } });
  for (const [index, key] of keys.entries()) {
    await service.patchActor({
      principal: HOST,
      chatId,
      targetRef: { kind: "npc", npcKey: key },
      ops: [{ op: "setIdentityText", field: "name", text: names[index] ?? "" }],
    });
  }
  return keys;
}

test("#1386 the promoted handle is `slugifyHandle`'s, and it fits the character wire cap the actor key ignores", async () => {
  const { chatId, service, fakes } = await seedGame();
  // A model authors the NPC's name and nothing bounds it (`rpgActorIdentitySchema.name` is `min(1)` only), so
  // this is reachable state, not a hypothetical: under the actor engine the handle came out 300 characters
  // long — a row the character namespace's own create schema (and every import that re-validates through it)
  // refuses at 200.
  const long = `Sœur ${"あ".repeat(300)}`;
  const [key] = await seedCastActor(service, chatId, [long]);
  await service.promoteActor({ principal: HOST, chatId, targetRef: { kind: "npc", npcKey: key ?? "" } });

  const handle = fakes.promoteMints[0]?.handle ?? "";
  expect(handle).toBe(slugifyHandle(long));
  expect(createCharacterSchema.shape.handle.safeParse(handle).success).toBe(true);
  // The two engines genuinely disagree here — the pin would be vacuous if they did not.
  expect(handle).not.toBe(rpgNpcSlug(long));
});

test("#1386 two NPCs named in different scripts promote to two DISTINCT handles under one owner", async () => {
  // A FENCE, not a defect proof: it passes on both engines (each fixed its own ASCII-only kept set — #1366
  // here, #1355 in kit), and it is here so a future fold change cannot quietly re-merge the population that
  // both fixes were about. The per-owner unique index must never see one bucket for two people, and the
  // uniquifier in the compose mint can only rescue a collision it is HANDED — a fold that erases both names
  // hands it the same string twice.
  const { chatId, service, fakes } = await seedGame();
  const names = ["李明", "Мария", "محمد"];
  const keys = await seedCastActor(service, chatId, names);
  for (const key of keys) {
    expect(await service.promoteActor({ principal: HOST, chatId, targetRef: { kind: "npc", npcKey: key } })).toStrictEqual({ ok: true, issues: [] });
  }
  const handles = fakes.promoteMints.map((mint) => mint.handle);
  expect(handles).toHaveLength(names.length);
  expect(new Set(handles).size).toBe(names.length);
  expect(handles).toEqual(names.map((name) => slugifyHandle(name)));
  // A SECOND promotion of the same name is the roster's documented refusal (pinned above), never a
  // unique-index throw — and the handle namespace's own duplicates are uniquified by the compose mint.
});

// ── #1449: an over-length model-authored NAME clamps the card name — it does not refuse the promotion ──────
// `rpgActorIdentitySchema.name` is model-authored at the extraction boundary with no max (same reachable
// state as #1386's handle), and `cardFaceFields.name` caps at `CARD_FACE_LIMITS.nameMax`. ORCHESTRATOR RULING
// (2026-09-05): clamp, never refuse — a refusal would drop a model-authored actor from canon over a name.

test("#1449 a 300-char NPC name promotes: the card name is clamped and the truncation is reported as an issue", async () => {
  const { chatId, service, fakes } = await seedGame();
  const long = `Sœur ${"あ".repeat(300)}`;
  const [key] = await seedCastActor(service, chatId, [long]);

  const result = await service.promoteActor({ principal: HOST, chatId, targetRef: { kind: "npc", npcKey: key ?? "" } });

  // The clamped value the mint actually received — the SAME pure clamp the contract test pins, so the two
  // can never disagree about what "clamped" means.
  const { value: clamped, truncated } = clampActorCardName(long.trim());
  expect(truncated).toBe(true);
  expect(fakes.promoteMints[0]?.name).toBe(clamped);
  expect(createCharacterSchema.shape.name.safeParse(fakes.promoteMints[0]?.name).success).toBe(true);

  // Never a silent success — the host learns the model over-ran the card name limit.
  expect(result.ok).toBe(true);
  const issues = result.ok ? result.issues : [];
  expect(issues.length > 0).toBe(true);
  expect(issues.some((issue) => issue.includes(long.trim()) && issue.includes(clamped))).toBe(true);
});

test("#1449 a short NPC name promotes cleanly: no truncation, no issue", async () => {
  const { chatId, service, fakes } = await seedGame();
  const [key] = await seedCastActor(service, chatId, ["Sister Vesna"]);
  const result = await service.promoteActor({ principal: HOST, chatId, targetRef: { kind: "npc", npcKey: key ?? "" } });
  expect(result).toStrictEqual({ ok: true, issues: [] });
  expect(fakes.promoteMints[0]?.name).toBe("Sister Vesna");
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
  expect(after?.actorState?.[0]?.volatile.status).toBe("healed");
});
