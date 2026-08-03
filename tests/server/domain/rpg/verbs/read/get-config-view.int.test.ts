// verbs/read/get-config-view — getConfigView (rpg-design/05 §4.8, §6.2). HOST-gated. Carries the knobs
// (`gmPresetId` / `extractionMode`) at their defaults on a fresh game, and the WAVE MU macro-editor pair:
// the game's own authored `userMacros` + the NAMES the chat's active preset declares (the shadow gloss the
// host console renders — a game macro sharing a preset macro's name is the one the turn resolves).

import { userMacroSchema } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../../../../support/db";
import { expect, principal, seedLiteGame, test } from "../../_support";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("getConfigView", () => {
  test("carries the knobs at their defaults (gmPresetId null, extractionMode folded)", async () => {
    const { chatId, h } = await seedLiteGame(db);
    const config = await h.service.getConfigView({ principal: principal(castId<Handle>("host")), chatId });
    expect(config.gmPresetId).toBeNull(); // the knob default
    expect(config.extractionMode).toBe("folded"); // the delivery-model knob default (born folded, 2026-08-01)
  });

  test("WAVE MU: a fresh game declares no macros, and the active preset's NAMES ride the view", async () => {
    const { chatId, h } = await seedLiteGame(db, {
      presetUserMacros: [userMacroSchema.parse({ name: "tone", body: "grim" }), userMacroSchema.parse({ name: "house_rule", body: "no crits" })],
    });
    const config = await h.service.getConfigView({ principal: principal(castId<Handle>("host")), chatId });
    expect(config.userMacros).toEqual([]);
    // NAMES only — the editor needs collision detection, never the preset's bodies (least privilege).
    expect(config.presetMacroNames).toEqual(["tone", "house_rule"]);
  });

  test("WAVE MU: the game's authored macros round-trip whole through the config door", async () => {
    const { chatId, h } = await seedLiteGame(db, { presetUserMacros: [userMacroSchema.parse({ name: "tone", body: "grim" })] });
    const gameTone = userMacroSchema.parse({ name: "tone", body: "sunlit", description: "the game's own tone" });
    await h.service.updateConfig({
      principal: principal(castId<Handle>("host")),
      chatId,
      patch: { userMacros: [gameTone, userMacroSchema.parse({ name: "waystone", body: "the stone hums" })] },
    });

    const config = await h.service.getConfigView({ principal: principal(castId<Handle>("host")), chatId });
    expect(config.userMacros).toEqual([gameTone, userMacroSchema.parse({ name: "waystone", body: "the stone hums" })]);
    // The collision is REAL and the view still reports the preset name — the editor is what surfaces it (the
    // game def wins at turn time; nothing here refuses or drops either definition).
    expect(config.presetMacroNames).toContain("tone");

    // Whole-list replace: a shorter list REPLACES, it does not merge.
    await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { userMacros: [gameTone] } });
    const after = await h.service.getConfigView({ principal: principal(castId<Handle>("host")), chatId });
    expect(after.userMacros).toEqual([gameTone]);
  });
});
