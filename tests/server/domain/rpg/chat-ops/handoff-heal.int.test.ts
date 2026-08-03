// tests/server/domain/rpg/chat-ops/handoff-heal — `ChatRpgOps.handoffHealStatements` (stickler 2026-08-03 F1),
// the HOST-HANDOFF twin of the fork's `gmPresetId` carry gate. The op is principal-free (chat gated the accept)
// and WRITES NOTHING: it returns the statements chat folds into its role-swap batch, so these tests assert both
// halves — the verdict (which rooms yield a statement) AND that the op left the row alone until the statement is
// executed. What is proven:
//   • a FOREIGN preset (one the new host cannot read) yields the clear, and executing it nulls the knob;
//   • a preset the new host CAN read yields nothing (conditional heal — never a blanket clear);
//   • an unset knob / a non-game chat yield nothing (a plain-room handoff stays byte-identical);
//   • a DISENGAGED game still heals — the knob outlives the front-door toggle, so a re-engage must not wake up
//     pointing at the old host's private preset.

import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { characters, presets, rpgSheets } from "@orb/db";
import { batchMany } from "@orb/db/kit";
import type { CharacterHandle, CharacterId, ChatId, Handle, PresetId, RpgGameId, RpgSheetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { findGameByChat, insertGame } from "../../../../../packages/server/src/domain/rpg/persistence/games";
import { freshDb } from "../../../../support/db";
import type { RpgHarness } from "../_support";
import { expect, FROZEN_AT, liteConfig, makeRpgService, seedChat, seedUser, test } from "../_support";

const NEW_HOST = castId<UserId>("user_nominee");
const OLD_HOST = castId<UserId>("user_departing");

/** The NO-OFFER heal args — the shape a handoff with no accepted property offer passes. Every pre-offer
 *  assertion below rides this, which is the byte-identity claim: the offer arms change nothing when absent. */
function healArgs(
  chatId: ChatId,
  over: Partial<Parameters<RpgHarness["chatOps"]["handoffHealStatements"]>[0]> = {},
): Parameters<RpgHarness["chatOps"]["handoffHealStatements"]>[0] {
  return { chatId, newHostUserId: NEW_HOST, oldHostUserId: OLD_HOST, copyGmPreset: false, cardCopies: [], ...over };
}

/** A game room for `key` whose GM knob points at `gmPresetId`, owned by a freshly seeded host. */
async function seedGameRoom(
  db: Db,
  key: string,
  opts: { readonly gmPresetId?: PresetId | null; readonly engaged?: boolean } = {},
): Promise<{ chatId: ChatId; gameId: RpgGameId }> {
  const gm = await seedUser(db, castId<Handle>(`gm_${key}`));
  const chatId = await seedChat(db, `hoff_${key}`);
  const gameId = castId<RpgGameId>(`rpg_game_hoff_${key}`);
  await insertGame(db, {
    id: gameId,
    chatId,
    mode: "lite",
    status: "active",
    sessionNumber: 1,
    gmUserId: gm,
    gmPresetId: opts.gmPresetId ?? null,
    config: { ...liteConfig(), engaged: opts.engaged ?? true },
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  });
  return { chatId, gameId };
}

/** A `rpg_sheets` row keyed to a real `characters` row (the FK is CASCADE-on-identity, so the card must
 *  exist). Returns the seeded character id. */
async function seedSheetFor(db: Db, gameId: RpgGameId, ownerId: UserId, key: string): Promise<CharacterId> {
  const characterId = castId<CharacterId>(`character_${key}`);
  await db
    .insert(characters)
    .values({ id: characterId, ownerId, handle: castId<CharacterHandle>(key), name: key, contentHash: key, tokenSize: 0, createdAt: FROZEN_AT });
  await db.insert(rpgSheets).values({
    id: castId<RpgSheetId>(`rpg_sheet_${key}`),
    gameId,
    characterId,
    userId: null,
    sheet: { className: "warden", attributes: {}, flavor: "", level: null, trackerGrants: [], trackerRevokes: [] },
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  });
  return characterId;
}

/** A preset row the `gmPresetId` FK can point at (owner irrelevant here — readability is the injected op's). */
async function seedPresetRow(db: Db, id: string, ownerId: UserId): Promise<PresetId> {
  const presetId = castId<PresetId>(id);
  await db.insert(presets).values({ id: presetId, ownerId, name: id, kind: "user", config: DEFAULT_PROMPT_CONFIG, createdAt: FROZEN_AT, updatedAt: FROZEN_AT });
  return presetId;
}

test("a preset the NEW HOST cannot read yields the clear — and nothing is written until chat commits it", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, castId<Handle>("oldhost"));
  const preset = await seedPresetRow(db, "preset_foreign", oldHost);
  const { chatId } = await seedGameRoom(db, "foreign", { gmPresetId: preset });
  const h = makeRpgService(db); // `ownedPresets` empty ⇒ every preset is foreign to the nominee

  const stmts = await h.chatOps.handoffHealStatements(healArgs(chatId));

  expect(stmts).toHaveLength(1);
  // The op is a pure producer: the knob still stands until the caller's batch runs (the atomicity property —
  // chat commits the heal WITH the role swap, never as a second write a crash could skip).
  expect((await findGameByChat(db, chatId))?.gmPresetId).toBe(preset);
  await db.batch(batchMany(stmts));
  expect((await findGameByChat(db, chatId))?.gmPresetId).toBeNull();
});

test("a preset the new host CAN read is left alone (the heal is conditional, not a blanket clear)", async () => {
  const db = await freshDb();
  await seedUser(db, castId<Handle>("nominee")); // the FK owner of the preset below (`user_nominee` === NEW_HOST)
  const preset = await seedPresetRow(db, "preset_owned", NEW_HOST);
  const { chatId } = await seedGameRoom(db, "owned", { gmPresetId: preset });
  const h = makeRpgService(db);
  h.fakes.ownedPresets.add(`${preset}:${NEW_HOST}`);

  expect(await h.chatOps.handoffHealStatements(healArgs(chatId))).toEqual([]);
  expect((await findGameByChat(db, chatId))?.gmPresetId).toBe(preset);
});

test("an unset knob and a non-game chat both heal nothing (a plain-room handoff is byte-identical)", async () => {
  const db = await freshDb();
  const { chatId } = await seedGameRoom(db, "noknob");
  const plainChatId = await seedChat(db, "hoff_plain");
  const h = makeRpgService(db);

  expect(await h.chatOps.handoffHealStatements(healArgs(chatId))).toEqual([]);
  expect(await h.chatOps.handoffHealStatements(healArgs(plainChatId))).toEqual([]);
});

test("a DISENGAGED game still heals — the knob must not survive the toggle back on", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, castId<Handle>("oldhost2"));
  const preset = await seedPresetRow(db, "preset_disengaged", oldHost);
  const { chatId } = await seedGameRoom(db, "disengaged", { gmPresetId: preset, engaged: false });
  const h = makeRpgService(db);

  const stmts = await h.chatOps.handoffHealStatements(healArgs(chatId));
  await db.batch(batchMany(stmts));
  expect((await findGameByChat(db, chatId))?.gmPresetId).toBeNull();
});

// ── THE COPY OFFER's rpg arms (2026-08-03) ──────────────────────────────────────────────────────────────
// The offer turns the clear into a GIFT. What must hold: the copy is asked for with BOTH owners explicit
// (the injected-op caller gate — an op that re-derived either end could mint a stranger's config into
// anyone's library), the knob is RE-POINTED at the copy rather than nulled, and a copy that cannot resolve
// falls back to the built clear rather than leaving the room pointed at a preset the host can't read.

test("an offered GM preset the new host cannot read is COPIED and the knob re-pointed — not nulled", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, castId<Handle>("oldhost_gift"));
  await seedUser(db, castId<Handle>("nominee"));
  const preset = await seedPresetRow(db, "preset_gifted", oldHost);
  // The fake's deterministic copy id — seeded as a REAL row so the re-point statement's FK is exercised for
  // real (the whole claim is that the knob ends up pointing at something the new host can actually read).
  await seedPresetRow(db, `${preset}__copy_${NEW_HOST}`, NEW_HOST);
  const { chatId } = await seedGameRoom(db, "gift", { gmPresetId: preset });
  const h = makeRpgService(db);

  const stmts = await h.chatOps.handoffHealStatements(healArgs(chatId, { copyGmPreset: true, oldHostUserId: oldHost }));

  // BOTH owners arrived explicitly — the caller-gate proof.
  expect(h.fakes.presetCopies).toEqual([{ fromOwnerId: oldHost, toUserId: NEW_HOST, presetId: preset }]);
  // Still a pure producer: nothing moves until chat's swap batch runs.
  expect((await findGameByChat(db, chatId))?.gmPresetId).toBe(preset);
  await db.batch(batchMany(stmts));
  expect((await findGameByChat(db, chatId))?.gmPresetId).toBe(`${preset}__copy_${NEW_HOST}`);
});

test("an offered preset that CANNOT be copied falls back to the built clear (never a knob that lies)", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, castId<Handle>("oldhost_nocopy"));
  const preset = await seedPresetRow(db, "preset_nocopy", oldHost);
  const { chatId } = await seedGameRoom(db, "nocopy", { gmPresetId: preset });
  const h = makeRpgService(db, { copyPresetFails: true });

  const stmts = await h.chatOps.handoffHealStatements(healArgs(chatId, { copyGmPreset: true, oldHostUserId: oldHost }));
  await db.batch(batchMany(stmts));

  expect((await findGameByChat(db, chatId))?.gmPresetId).toBeNull();
});

test("an offered preset the new host ALREADY reads is never copied (the conditional gate runs first)", async () => {
  const db = await freshDb();
  await seedUser(db, castId<Handle>("nominee"));
  const oldHost = await seedUser(db, castId<Handle>("oldhost_owned"));
  const preset = await seedPresetRow(db, "preset_already", NEW_HOST);
  const { chatId } = await seedGameRoom(db, "already", { gmPresetId: preset });
  const h = makeRpgService(db);
  h.fakes.ownedPresets.add(`${preset}:${NEW_HOST}`);

  expect(await h.chatOps.handoffHealStatements(healArgs(chatId, { copyGmPreset: true, oldHostUserId: oldHost }))).toEqual([]);
  expect(h.fakes.presetCopies).toEqual([]);
});

test("the copied cast's SHEETS re-key onto the copies in the swap batch (the room's identity data moves with it)", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, castId<Handle>("oldhost_sheets"));
  await seedUser(db, castId<Handle>("nominee"));
  const { chatId, gameId } = await seedGameRoom(db, "sheets");
  const source = await seedSheetFor(db, gameId, oldHost, "mara_src");
  // The copy card already exists in the nominee's library (chat minted it before the swap batch).
  const copy = castId<CharacterId>("character_mara_copy");
  await db.insert(characters).values({
    id: copy,
    ownerId: NEW_HOST,
    handle: castId<CharacterHandle>("mara_copy"),
    name: "Mara",
    contentHash: "c",
    tokenSize: 0,
    createdAt: FROZEN_AT,
  });
  const h = makeRpgService(db);

  const stmts = await h.chatOps.handoffHealStatements(healArgs(chatId, { cardCopies: [{ sourceCharacterId: source, characterId: copy }] }));
  // Pure producer again: the sheet still names the source until chat commits.
  expect((await db.select().from(rpgSheets).where(eq(rpgSheets.gameId, gameId)))[0]?.characterId).toBe(source);
  await db.batch(batchMany(stmts));

  expect((await db.select().from(rpgSheets).where(eq(rpgSheets.gameId, gameId)))[0]?.characterId).toBe(copy);
});
