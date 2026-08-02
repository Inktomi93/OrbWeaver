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
import { presets } from "@orb/db";
import { batchMany } from "@orb/db/kit";
import type { ChatId, PresetId, RpgGameId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { findGameByChat, insertGame } from "../../../../../packages/server/src/domain/rpg/persistence/games";
import { freshDb } from "../../../../support/db";
import { expect, FROZEN_AT, liteConfig, makeRpgService, seedChat, seedUser, test } from "../_support";

const NEW_HOST = castId<UserId>("user_nominee");

/** A game room for `key` whose GM knob points at `gmPresetId`, owned by a freshly seeded host. */
async function seedGameRoom(
  db: Db,
  key: string,
  opts: { readonly gmPresetId?: PresetId | null; readonly engaged?: boolean } = {},
): Promise<{ chatId: ChatId; gameId: RpgGameId }> {
  const gm = await seedUser(db, `gm_${key}`);
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

/** A preset row the `gmPresetId` FK can point at (owner irrelevant here — readability is the injected op's). */
async function seedPresetRow(db: Db, id: string, ownerId: UserId): Promise<PresetId> {
  const presetId = castId<PresetId>(id);
  await db.insert(presets).values({ id: presetId, ownerId, name: id, kind: "user", config: DEFAULT_PROMPT_CONFIG, createdAt: FROZEN_AT, updatedAt: FROZEN_AT });
  return presetId;
}

test("a preset the NEW HOST cannot read yields the clear — and nothing is written until chat commits it", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, "oldhost");
  const preset = await seedPresetRow(db, "preset_foreign", oldHost);
  const { chatId } = await seedGameRoom(db, "foreign", { gmPresetId: preset });
  const h = makeRpgService(db); // `ownedPresets` empty ⇒ every preset is foreign to the nominee

  const stmts = await h.chatOps.handoffHealStatements(chatId, NEW_HOST);

  expect(stmts).toHaveLength(1);
  // The op is a pure producer: the knob still stands until the caller's batch runs (the atomicity property —
  // chat commits the heal WITH the role swap, never as a second write a crash could skip).
  expect((await findGameByChat(db, chatId))?.gmPresetId).toBe(preset);
  await db.batch(batchMany(stmts));
  expect((await findGameByChat(db, chatId))?.gmPresetId).toBeNull();
});

test("a preset the new host CAN read is left alone (the heal is conditional, not a blanket clear)", async () => {
  const db = await freshDb();
  await seedUser(db, "nominee"); // the FK owner of the preset below (`user_nominee` === NEW_HOST)
  const preset = await seedPresetRow(db, "preset_owned", NEW_HOST);
  const { chatId } = await seedGameRoom(db, "owned", { gmPresetId: preset });
  const h = makeRpgService(db);
  h.fakes.ownedPresets.add(`${preset}:${NEW_HOST}`);

  expect(await h.chatOps.handoffHealStatements(chatId, NEW_HOST)).toEqual([]);
  expect((await findGameByChat(db, chatId))?.gmPresetId).toBe(preset);
});

test("an unset knob and a non-game chat both heal nothing (a plain-room handoff is byte-identical)", async () => {
  const db = await freshDb();
  const { chatId } = await seedGameRoom(db, "noknob");
  const plainChatId = await seedChat(db, "hoff_plain");
  const h = makeRpgService(db);

  expect(await h.chatOps.handoffHealStatements(chatId, NEW_HOST)).toEqual([]);
  expect(await h.chatOps.handoffHealStatements(plainChatId, NEW_HOST)).toEqual([]);
});

test("a DISENGAGED game still heals — the knob must not survive the toggle back on", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, "oldhost2");
  const preset = await seedPresetRow(db, "preset_disengaged", oldHost);
  const { chatId } = await seedGameRoom(db, "disengaged", { gmPresetId: preset, engaged: false });
  const h = makeRpgService(db);

  const stmts = await h.chatOps.handoffHealStatements(chatId, NEW_HOST);
  await db.batch(batchMany(stmts));
  expect((await findGameByChat(db, chatId))?.gmPresetId).toBeNull();
});
