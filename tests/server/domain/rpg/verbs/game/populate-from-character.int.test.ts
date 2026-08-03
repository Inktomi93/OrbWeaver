// tests/server/domain/rpg/verbs/game/populate-from-character — the HOST BORN-STATE doorway (owner ruling
// 2026-08-01). SECURITY-SENSITIVE: a host-principal MODEL-CALL site (the consent seam) AND the only door
// through which a model reaches the hand-only sheet fields. The load-bearing proofs:
//   • HOST-ONLY — a non-member gets leak-free NOT_FOUND, a present non-host member FORBIDDEN, BEFORE any card
//     read or model call (a member can never trigger the host-principal call).
//   • THE PRINCIPAL SEAM — the round resolves UNDER the room HOST's userId (the caller `resolveHost` confirmed
//     IS the host), never a caller-injected id, and it reads the CARD corpus (not the story window).
//   • THE FILL — the identity sheet (title/level), the starting gear + purse, and a background quest land; the
//     snapshot half rides a message-less HAND row (D124), born committed.
//   • FILL, NEVER OVERWRITE — a sheet field the host already wrote survives; a LOCKED quest survives.
//   • THE ARCHIVE IS UNTOUCHED — a card read writes no journal (it has no journal door at all).
//   • APPLICABILITY — a `user` actor (no card) and an unreadable card are REFUSED, before any model call.
//   • A no-op round writes NOTHING (no slot, no sheet row, no emit).
// The STRUCTURAL "populate can never touch a live-play plane" proof is a contract test (`salvagePopulate`
// rebuilds those planes empty), which is where it belongs — it is a property of the parse, not of this verb.

import type { RpgActorEntry, RpgQuest } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { DomainForbiddenError, DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import type { CharacterId, RpgQuestId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { freshDb } from "../../../../../support/db";
import type { RpgHarness } from "../../_support";
import { expect, principal, seedCharacter, seedLiteGame, seedUser, test } from "../../_support";

/** A seeded game whose roster carries ONE real character actor — the populate subject. The character id is a
 *  REAL minted TypeID because the snapshot write re-validates the volatile `actorRef` (a fabricated id would
 *  be dropped at the F1 backstop and the fill would silently vanish). */
async function seedCharacterGame(
  db: Db,
  over: Parameters<typeof seedLiteGame>[1] = {},
  key = "a",
): Promise<{ chatId: Awaited<ReturnType<typeof seedLiteGame>>["chatId"]; characterId: CharacterId; h: RpgHarness }> {
  const ownerId = await seedUser(db, "cardowner");
  const characterId = await seedCharacter(db, ownerId, "mara", { id: mintTypeId(ID_PREFIX.character) });
  const seeded = await seedLiteGame(db, { roster: [{ actorRef: { kind: "character", characterId }, name: "Mara" }], ...over }, key);
  return { chatId: seeded.chatId, characterId, h: seeded.h };
}

/** The volatile plane a populate round's inventory/wallet writes produce (the ABSOLUTE plane the real fold
 *  emits — the fake stands in for `extractionToStateDelta`'s output, which its own tests cover). */
function filledActor(characterId: CharacterId): RpgActorEntry {
  return {
    actorRef: { kind: "character", characterId },
    volatile: {
      trackerValues: {},
      conditions: [],
      inventory: [{ id: "item_bone_key", name: "Bone key", description: "cold to the touch", quantity: 1, location: "belt pouch", type: "" }],
      wallet: [{ name: "gold", amount: 20 }],
      status: "",
    },
  };
}

/** A background-implied quest the round establishes. */
function bornQuest(id: string, name: string): RpgQuest {
  return { id: castId<RpgQuestId>(id), name, status: "active", description: "", objectives: [] };
}

test("HOST fill: the card's identity + gear land — sheet, inventory, purse, quest, on a message-less HAND row", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, "cardowner");
  const characterId = await seedCharacter(db, ownerId, "mara", { id: mintTypeId(ID_PREFIX.character) });
  const { chatId, h } = await seedLiteGame(db, {
    roster: [{ actorRef: { kind: "character", characterId }, name: "Mara" }],
    populateDelta: {
      statePatch: { actorState: [filledActor(characterId)], quests: [bornQuest("q_vault", "Reach the Vault of Ash")] },
      sheet: { className: "Warden of House Vane", level: 3 },
    },
  });
  h.fakes.busEvents.length = 0;

  await h.service.populateFromCharacter({ principal: principal("host"), chatId, actorRef: { kind: "character", characterId } });

  // The round read THIS character's card (never the story window) and ran under the room host's own userId.
  expect(h.fakes.cardCorpusReads).toEqual([{ chatId, characterId }]);
  expect(h.fakes.populateCalls).toHaveLength(1);
  expect(h.fakes.populateCalls[0]?.hostUserId).toBe("user_host");
  expect(h.fakes.populateCalls[0]?.targetRef).toBe("Mara");
  expect(h.fakes.populateCalls[0]?.corpus.card).toContain("warden of a fallen house");
  // The deep STORY read is NOT this verb's — a born-state round never reads play (that is resyncFromStory).
  expect(h.fakes.canonWindowReads).toEqual([]);

  // D124: the snapshot half is a message-less HAND row — the populate posts NOTHING to canon.
  expect(h.fakes.narratorPosts).toEqual([]);

  const view = await h.service.getTrackerView({ principal: principal("host"), chatId });
  const actor = view.actors.find((a) => a.name === "Mara");
  expect(actor?.sheet.className).toBe("Warden of House Vane");
  expect(actor?.sheet.level).toBe(3);
  expect(actor?.volatile?.inventory.map((i) => i.name)).toEqual(["Bone key"]);
  expect(actor?.volatile?.wallet).toEqual([{ name: "gold", amount: 20 }]);
  expect(view.quests.map((q) => q.name)).toEqual(["Reach the Vault of Ash"]);
  // §4.9: BOTH doors repainted — the sheet row and the snapshot head.
  expect(h.fakes.busEvents.map((e) => e.type).sort()).toEqual(["sheetChanged", "snapshotPatched"]);
});

test("FILL, never overwrite: a title/level the host already wrote SURVIVES the round", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, "cardowner");
  const characterId = await seedCharacter(db, ownerId, "mara", { id: mintTypeId(ID_PREFIX.character) });
  const { chatId, h } = await seedLiteGame(db, {
    roster: [{ actorRef: { kind: "character", characterId }, name: "Mara" }],
    populateDelta: { statePatch: {}, sheet: { className: "the model's title", level: 9 } },
  });
  // The host typed their own title + level first — the sheet has no lock plane, so "already written" IS the pin.
  await h.service.patchSheet({
    principal: principal("host"),
    chatId,
    actorRef: { kind: "character", characterId },
    patch: { className: "Hand-written", level: 1 },
  });
  h.fakes.busEvents.length = 0;

  await h.service.populateFromCharacter({ principal: principal("host"), chatId, actorRef: { kind: "character", characterId } });

  const view = await h.service.getTrackerView({ principal: principal("host"), chatId });
  const actor = view.actors.find((a) => a.name === "Mara");
  expect(actor?.sheet.className).toBe("Hand-written");
  expect(actor?.sheet.level).toBe(1);
  // Nothing changed ⇒ no row write, no repaint (a byte-identical non-acting round).
  expect(h.fakes.busEvents).toEqual([]);
});

test("a LOCKED quest survives the round (the hand-pin beats the card, like every other model write)", async () => {
  const db = await freshDb();
  const { chatId, characterId, h } = await seedCharacterGame(db);
  // The host authored a goal by hand — `upsertQuest` stamps the `quests.<id>` lock (manual-edit-wins).
  const questId = await h.service.upsertQuest({ principal: principal("host"), chatId, name: "The host's own goal" });
  // The round tries to rewrite that very quest.
  h.fakes.populateDelta = { statePatch: { quests: [{ ...bornQuest(questId, "the card's rewrite"), description: "clobbered" }] }, sheet: {} };

  await h.service.populateFromCharacter({ principal: principal("host"), chatId, actorRef: { kind: "character", characterId } });

  const view = await h.service.getTrackerView({ principal: principal("host"), chatId });
  expect(view.quests.map((q) => q.name)).toEqual(["The host's own goal"]);
});

test("the ARCHIVE is untouched — a card read writes no journal entry (it has no journal door)", async () => {
  const db = await freshDb();
  const { chatId, characterId, h } = await seedCharacterGame(db);
  h.fakes.populateDelta = { statePatch: { quests: [bornQuest("q_born", "A background hook")] }, sheet: { level: 1 } };

  await h.service.populateFromCharacter({ principal: principal("host"), chatId, actorRef: { kind: "character", characterId } });

  expect(await h.service.listJournal({ principal: principal("host"), chatId, limit: 50 })).toEqual([]);
  expect(h.fakes.busEvents.map((e) => e.type)).not.toContain("journalChanged");
});

test("AUTHORITY: a non-member gets leak-free NOT_FOUND — before any card read or model call", async () => {
  const db = await freshDb();
  const { chatId, characterId, h } = await seedCharacterGame(db);

  await expect(
    h.service.populateFromCharacter({ principal: principal("stranger"), chatId, actorRef: { kind: "character", characterId } }),
  ).rejects.toBeInstanceOf(DomainNotFoundError);
  expect(h.fakes.populateCalls).toEqual([]);
  expect(h.fakes.cardCorpusReads).toEqual([]);
  expect(h.fakes.narratorPosts).toEqual([]);
});

test("AUTHORITY: a present NON-HOST member gets FORBIDDEN — the host-principal model call never fires", async () => {
  const db = await freshDb();
  const { chatId, characterId, h } = await seedCharacterGame(db);
  h.fakes.membership.set("user_member", "member");

  await expect(
    h.service.populateFromCharacter({ principal: principal("member"), chatId, actorRef: { kind: "character", characterId } }),
  ).rejects.toBeInstanceOf(DomainForbiddenError);
  expect(h.fakes.populateCalls).toEqual([]);
  expect(h.fakes.cardCorpusReads).toEqual([]);
});

test("APPLICABILITY: an actor with NO card (a user seat) is refused before any card read or model call", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedCharacterGame(db);

  await expect(
    h.service.populateFromCharacter({ principal: principal("host"), chatId, actorRef: { kind: "user", userId: castId<UserId>("user_host") } }),
  ).rejects.toBeInstanceOf(DomainOperationError);
  expect(h.fakes.cardCorpusReads).toEqual([]);
  expect(h.fakes.populateCalls).toEqual([]);
});

test("APPLICABILITY: an UNREADABLE card is refused — the round never runs on nothing", async () => {
  const db = await freshDb();
  const { chatId, characterId, h } = await seedCharacterGame(db);
  h.fakes.cardCorpus = null; // the card is gone / unreadable under the room host

  await expect(h.service.populateFromCharacter({ principal: principal("host"), chatId, actorRef: { kind: "character", characterId } })).rejects.toBeInstanceOf(
    DomainOperationError,
  );
  expect(h.fakes.cardCorpusReads).toHaveLength(1); // it tried…
  expect(h.fakes.populateCalls).toEqual([]); // …and stopped before the model call
});

test("a no-op round (no writer capability / a card that established nothing) writes NOTHING", async () => {
  const db = await freshDb();
  const { chatId, characterId, h } = await seedCharacterGame(db);
  h.fakes.busEvents.length = 0;

  const result = await h.service.populateFromCharacter({ principal: principal("host"), chatId, actorRef: { kind: "character", characterId } });

  expect(h.fakes.populateCalls).toHaveLength(1); // the call fired (the host resolved it) and produced nothing
  expect(h.fakes.narratorPosts).toEqual([]);
  expect(h.fakes.busEvents).toEqual([]);
  // …and the DOOR SAYS SO (POPLOUD). A round that filled nothing is `populated:false`, never an
  // undifferentiated "done" — the host clicked a button that costs money and seconds.
  expect(result).toEqual({ ok: true, populated: false });
});

// ── THE DOOR IS LOUD (POPLOUD) ───────────────────────────────────────────────────────────────────────
// `populateFromCharacter` returned `void`, so a card round that never RAN (the provider refused, the room's
// connection didn't resolve, the wire has no structured writer) was byte-identical to a card that
// established nothing: the button settled, the panel didn't move, the host was told success. That is the
// same silent fork RESYNC-OR fixed on the resync — the sibling verb, the same host-principal model call, the
// same default hosted backend that 400s the structured request. All three endings are now DATA
// (`PopulateResult`, the `HandDoorResult` grammar) and the client reads them.

test("a FILL reports ok:true populated:true (the client's success signal)", async () => {
  const db = await freshDb();
  const { chatId, characterId, h } = await seedCharacterGame(db);
  h.fakes.populateDelta = { statePatch: {}, sheet: { className: "Warden of House Vane", level: 3 } };

  expect(await h.service.populateFromCharacter({ principal: principal("host"), chatId, actorRef: { kind: "character", characterId } })).toEqual({
    ok: true,
    populated: true,
  });
});

test("a STATE-only fill (no sheet half) still reports populated:true — either plane landing IS a fill", async () => {
  const db = await freshDb();
  const { chatId, characterId, h } = await seedCharacterGame(db);
  h.fakes.populateDelta = { statePatch: { quests: [bornQuest("q_born", "A background hook")] }, sheet: {} };

  expect(await h.service.populateFromCharacter({ principal: principal("host"), chatId, actorRef: { kind: "character", characterId } })).toEqual({
    ok: true,
    populated: true,
  });
});

test("a round the FILL RULE fully absorbed reports populated:false — nothing changed, and the host hears that", async () => {
  const db = await freshDb();
  const { chatId, characterId, h } = await seedCharacterGame(db);
  h.fakes.populateDelta = { statePatch: {}, sheet: { className: "the model's title", level: 9 } };
  // The host already wrote BOTH fields — the fill rule keeps them, so the round changes nothing at all.
  await h.service.patchSheet({ principal: principal("host"), chatId, actorRef: { kind: "character", characterId }, patch: { className: "Hand-written", level: 1 } });
  h.fakes.busEvents.length = 0;

  const result = await h.service.populateFromCharacter({ principal: principal("host"), chatId, actorRef: { kind: "character", characterId } });

  expect(result).toEqual({ ok: true, populated: false });
  expect(h.fakes.busEvents).toEqual([]);
});

test("a round that could NOT RUN is surfaced as data — the provider's reason reaches the caller, never a silent 'nothing to fill'", async () => {
  const db = await freshDb();
  const { chatId, characterId, h } = await seedCharacterGame(db);
  h.fakes.populateRefusal = { ok: false, reason: "the model call failed, so nothing was filled: openrouter structured item 0 failed" };
  h.fakes.busEvents.length = 0;

  const result = await h.service.populateFromCharacter({ principal: principal("host"), chatId, actorRef: { kind: "character", characterId } });

  expect(result).toEqual({ ok: false, reason: "the model call failed, so nothing was filled: openrouter structured item 0 failed" });
  // A round that never ran writes NOTHING — the only change is that it SAYS so.
  expect(h.fakes.busEvents).toEqual([]);
  expect(h.fakes.narratorPosts).toEqual([]);
});
