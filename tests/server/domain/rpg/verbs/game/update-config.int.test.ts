// verbs/game/update-config — updateConfig (rpg-design/05 §4.4, §6.2). The knob defaults + the profile
// mutability matrix (add / referenced-remove refused). Mutations asserted at the ROW (assert-the-mutation-fired).

import { RPG_PROFILE_D20, RPG_PROFILE_FREEFORM } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { beforeEach, describe } from "vitest";
import { findGameByChat } from "../../../../../../packages/server/src/domain/rpg/persistence/games";
import { freshDb } from "../../../../../support/db";
import { expect, principal, seedLiteGame, seedPreset, seedUser, test } from "../../_support";

const EXTRACTION_RE = /extractionmode/i;
const REFERENCED_RE = /referenced/i;

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("updateConfig — knobs + profile mutability", () => {
  test("sets the gmPresetId + extractionMode knobs (both validated)", async () => {
    const { chatId, h } = await seedLiteGame(db);
    const preset = await seedPreset(db, "gm1", "presetowner");
    await h.service.updateConfig({ principal: principal("host"), chatId, gmPresetId: preset, extractionMode: "cheap", patch: { steeringNote: "lean dark" } });
    const game = await findGameByChat(db, chatId);
    expect(game?.gmPresetId).toBe(preset);
    expect(game?.config.lite.steeringNote).toBe("lean dark");
    expect(game?.config.extractionMode).toBe("cheap");
  });

  test("an explicit null gmPresetId clears back to augment", async () => {
    const { chatId, h } = await seedLiteGame(db);
    const preset = await seedPreset(db, "x", "pox");
    await h.service.updateConfig({ principal: principal("host"), chatId, gmPresetId: preset });
    await h.service.updateConfig({ principal: principal("host"), chatId, gmPresetId: null });
    expect((await findGameByChat(db, chatId))?.gmPresetId).toBeNull();
  });

  test("an invalid extractionMode is refused (the knob is validated)", async () => {
    const { chatId, h } = await seedLiteGame(db);
    await expect(h.service.updateConfig({ principal: principal("host"), chatId, extractionMode: "sloppy" })).rejects.toThrow(EXTRACTION_RE);
  });

  test("profile mutability: an ADD is legal", async () => {
    const { chatId, h } = await seedLiteGame(db);
    await h.service.updateConfig({ principal: principal("host"), chatId, patch: { statProfile: RPG_PROFILE_D20 } });
    expect((await findGameByChat(db, chatId))?.config.statProfile.attributes).toHaveLength(6);
  });

  test("profile mutability: a REFERENCED remove is REFUSED", async () => {
    const { chatId, h } = await seedLiteGame(db);
    const host = await seedUser(db, "host"); // the sheet FKs users.id
    await h.service.updateConfig({ principal: principal("host"), chatId, patch: { statProfile: RPG_PROFILE_D20 } });
    await h.service.patchSheet({ principal: principal("host"), chatId, actorRef: { kind: "user", userId: host }, patch: { attributes: { str: 12 } } });
    await expect(h.service.updateConfig({ principal: principal("host"), chatId, patch: { statProfile: RPG_PROFILE_FREEFORM } })).rejects.toThrow(REFERENCED_RE);
  });

  test("a non-member cannot updateConfig (leak-free)", async () => {
    const { chatId, h } = await seedLiteGame(db);
    await expect(h.service.updateConfig({ principal: principal("intruder"), chatId, patch: { steeringNote: "x" } })).rejects.toThrow();
  });
});
