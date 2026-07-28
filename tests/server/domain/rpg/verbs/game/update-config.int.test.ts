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

  test("sets the parity-plus feature knobs — castFields + relationshipHints (§2.8/§2.1 M1)", async () => {
    const { chatId, h } = await seedLiteGame(db);
    const castFields = [
      { key: "suspicion", label: "Suspicion", kind: "meter" as const, max: 10 },
      { key: "trust", label: "Trust", kind: "text" as const },
    ];
    await h.service.updateConfig({ principal: principal("host"), chatId, patch: { castFields, relationshipHints: { vassal: "sworn but resentful" } } });
    const game = await findGameByChat(db, chatId);
    expect(game?.config.features.castFields).toEqual(castFields);
    expect(game?.config.features.relationshipHints).toEqual({ vassal: "sworn but resentful" });
    // Omit keeps the features (a later unrelated patch does not wipe them).
    await h.service.updateConfig({ principal: principal("host"), chatId, patch: { steeringNote: "x" } });
    expect((await findGameByChat(db, chatId))?.config.features.castFields).toHaveLength(2);
  });

  test("sets the P3 hidden-channel knobs; an OMITTED knob KEEPS its value (deception survives an unrelated edit)", async () => {
    const { chatId, h } = await seedLiteGame(db);
    // Turn deception on + set the recent-beats cap.
    await h.service.updateConfig({ principal: principal("host"), chatId, patch: { deception: true, recentBeatsKeepLast: 3 } });
    let game = await findGameByChat(db, chatId);
    expect(game?.config.features.deception).toBe(true);
    expect(game?.config.features.recentBeatsKeepLast).toBe(3);
    // The load-bearing keep-on-omit: a later patch that touches ONLY the steeringNote must NOT reset deception
    // (or the reasoning-strip that rides it) to its default — the schema `.parse` would otherwise wipe it.
    await h.service.updateConfig({ principal: principal("host"), chatId, patch: { steeringNote: "grim" } });
    game = await findGameByChat(db, chatId);
    expect(game?.config.features.deception).toBe(true);
    expect(game?.config.features.recentBeatsKeepLast).toBe(3);
    expect(game?.config.features.hiddenContentReveal).toBe(true); // M4 default preserved
  });

  test("sets the P4 card knobs; an unrelated patch never resets an unnamed knob (§9 #7 + M2/M3)", async () => {
    const { chatId, h } = await seedLiteGame(db);
    await h.service.updateConfig({
      principal: principal("host"),
      chatId,
      patch: { immersiveHtml: false, immersiveHtmlInteractive: false, cardKeepLastX: 2 },
    });
    let game = await findGameByChat(db, chatId);
    expect(game?.config.features.immersiveHtml).toBe(false);
    expect(game?.config.features.immersiveHtmlInteractive).toBe(false);
    expect(game?.config.features.cardKeepLastX).toBe(2);
    // The preserve pin ([versioned-config-lift-drops-overrides] class): a later patch naming OTHER knobs
    // carries the card knobs through unchanged — a config write can never silently reset them to defaults.
    await h.service.updateConfig({ principal: principal("host"), chatId, patch: { steeringNote: "keep going" } });
    game = await findGameByChat(db, chatId);
    expect(game?.config.features.immersiveHtml).toBe(false);
    expect(game?.config.features.cardKeepLastX).toBe(2);
  });

  test("sets the P5 play-style knobs (cyoa/plotProgression); an unrelated patch never resets them (§5.4/§6.4)", async () => {
    const { chatId, h } = await seedLiteGame(db);
    // Defaults at birth: cyoa OFF (a strong play-style), plotProgression ON (unobtrusive, click-only).
    let game = await findGameByChat(db, chatId);
    expect(game?.config.features.cyoa).toBe(false);
    expect(game?.config.features.plotProgression).toBe(true);
    // Flip both away from their defaults.
    await h.service.updateConfig({ principal: principal("host"), chatId, patch: { cyoa: true, plotProgression: false } });
    game = await findGameByChat(db, chatId);
    expect(game?.config.features.cyoa).toBe(true);
    expect(game?.config.features.plotProgression).toBe(false);
    // The never-reset pin ([versioned-config-lift-drops-overrides] class): an unrelated write keeps both.
    await h.service.updateConfig({ principal: principal("host"), chatId, patch: { steeringNote: "onward" } });
    game = await findGameByChat(db, chatId);
    expect(game?.config.features.cyoa).toBe(true);
    expect(game?.config.features.plotProgression).toBe(false);
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
