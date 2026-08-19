// entry/compose/preset-usage — the BACKWARD-BINDINGS resolver behind `preset.listUsage` (#279).
//
// It exists at the composition root because its two facts belong to two other domains: settings' active
// pick and rpg's `gmPresetId`, with the room half gated by chat's membership. These pins are about the
// SHAPE of that answer, which is the finding the issue's premise got wrong: a chat carries no preset, so
// "which chats use this preset" is (a) a SETTING for ordinary rooms and (b) the rpg GM redirect for the one
// per-room binding that exists. There is no role/connection arm to test because no connection references a
// preset.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { rpgGames } from "@orb/db";
import type { ChatId, Handle, PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import type { SettingsService } from "../../../../packages/server/src/domain/settings/index.ts";
import { createResolvePresetUsage } from "../../../../packages/server/src/entry/compose/preset-usage.ts";
import { createResolveVisibleRooms } from "../../../../packages/server/src/entry/compose/visible-rooms.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { seedChat, seedParticipant } from "../../domain/chat/_support.ts";
import { seedPreset } from "../../domain/preset/_support.ts";
import { principal, seedUser } from "../../domain/regex/_support.ts";
import { seedGame } from "../../domain/rpg/_support.ts";

const NOW = 1_700_000_000_000;
const PRESET = castId<PresetId>("preset_gmvoice");

/** The settings read the resolver takes its active pick from — the REAL default settings with one seed
 *  swapped, so the fake cannot drift from the schema the production op returns. */
function settingsWithDefault(defaultPresetId: PresetId | null): SettingsService["loadUserSettings"] {
  return () => Promise.resolve({ ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, defaultPresetId } });
}

/** A lite game on `chatId` whose GM voice redirects to `presetId` (the one per-room preset binding). The
 *  preset row itself is seeded by the caller: `rpg_games.gm_preset_id` is a real FK, and several games may
 *  legitimately point at ONE preset — which is exactly the case the roster is for. */
async function seedGmGame(db: Awaited<ReturnType<typeof freshDb>>, chatId: ChatId, key: string, presetId: PresetId): Promise<void> {
  const id = await seedGame(db, chatId, key);
  await db.update(rpgGames).set({ gmPresetId: presetId }).where(eq(rpgGames.id, id));
}

describe("compose/preset-usage — a preset's backward bindings", () => {
  test("the ACTIVE PICK is a setting, reported as one", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const resolve = createResolvePresetUsage({
      db,
      loadUserSettings: settingsWithDefault(PRESET),
      resolveVisibleRooms: createResolveVisibleRooms(db),
    });

    expect(await resolve(principal(owner), PRESET)).toEqual({ isUserDefault: true, gmRooms: [] });
  });

  test("a GM-voice game names its room; a game the caller was removed from does NOT", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const seated = await seedChat(db, "seated", { title: "The Long Dark", updatedAt: NOW });
    const kicked = await seedChat(db, "kicked", { title: "Their table", updatedAt: NOW });
    await seedParticipant(db, { chatId: seated, key: "s", userId: owner, role: "host" });
    await seedParticipant(db, { chatId: kicked, key: "k", userId: owner, role: "member", leftSeq: 9 });
    await seedPreset(db, { id: PRESET, ownerId: null, name: "GM voice" });
    await seedGmGame(db, seated, "seated", PRESET);
    await seedGmGame(db, kicked, "kicked", PRESET);

    const resolve = createResolvePresetUsage({
      db,
      loadUserSettings: settingsWithDefault(null),
      resolveVisibleRooms: createResolveVisibleRooms(db),
    });
    const usage = await resolve(principal(owner), PRESET);

    expect(usage.isUserDefault).toBe(false);
    expect(usage.gmRooms.map((room) => room.id)).toEqual([seated]);
    // The room they lost their seat in leaves nothing behind — the same no-residue rule the roster follows.
    expect(JSON.stringify(usage)).not.toContain(kicked);
  });

  test("a game pointing at ANOTHER preset is not a binding", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const room = await seedChat(db, "room", { title: "Elsewhere", updatedAt: NOW });
    await seedParticipant(db, { chatId: room, key: "r", userId: owner, role: "host" });
    const other = castId<PresetId>("preset_other");
    await seedPreset(db, { id: other, ownerId: null, name: "Another voice" });
    await seedGmGame(db, room, "other", other);

    const resolve = createResolvePresetUsage({
      db,
      loadUserSettings: settingsWithDefault(null),
      resolveVisibleRooms: createResolveVisibleRooms(db),
    });

    expect(await resolve(principal(owner), PRESET)).toEqual({ isUserDefault: false, gmRooms: [] });
  });
});
