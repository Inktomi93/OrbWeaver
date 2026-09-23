// verbs/game/update-config — updateConfig (docs/plans/rpg/design.md). The knob defaults + the profile
// mutability matrix (add / referenced-remove refused). Mutations asserted at the ROW (assert-the-mutation-fired).

import { userMacroSchema } from "@orb/contracts/preset";
import { RPG_CONFIG_MAX_TRACKERS, RPG_PROFILE_D20, RPG_PROFILE_FREEFORM, rpgTrackerDefSchema, rpgUpdateConfigInputSchema } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { findGameByChat } from "../../../../../../packages/server/src/domain/rpg/persistence/games.ts";
import { freshDb } from "../../../../../support/db.ts";
import { expect, principal, seedLiteGame, seedPreset, seedUser, test } from "../../_support.ts";

const EXTRACTION_RE = /extractionmode/i;
const REFERENCED_RE = /referenced/i;

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("updateConfig — the RULESET setting (#862)", () => {
  test("a ruleset CHANGE applies its vocabulary additively — attributes + the seeded HP meter land beside the host's own", async () => {
    const { chatId, h } = await seedLiteGame(db);
    const host = principal(castId<Handle>("host"));
    await h.service.updateConfig({
      principal: host,
      chatId,
      patch: { trackers: [rpgTrackerDefSchema.parse({ key: "grit", label: "Grit", shape: "meter", write: "delta", subject: "actor", appliesTo: "party" })] },
    });

    await h.service.updateConfig({ principal: host, chatId, patch: { ruleset: "d20" } });

    const game = await findGameByChat(db, chatId);
    expect(game?.config.ruleset).toBe("d20");
    expect(game?.config.statProfile.attributes.map((a) => a.key)).toEqual(["str", "dex", "con", "int", "wis", "cha"]);
    // The host's own tracker is untouched and the ruleset's seeded HP joins it — never a replace.
    expect(game?.config.trackers.map((t) => t.key)).toEqual(["grit", "hp"]);
  });

  test("THE OWNER RULING, at the write door: d20 → freeform → d20 keeps every tracker and every attribute", async () => {
    const { chatId, h } = await seedLiteGame(db);
    const host = principal(castId<Handle>("host"));
    await h.service.updateConfig({ principal: host, chatId, patch: { ruleset: "d20" } });
    await h.service.updateConfig({ principal: host, chatId, patch: { ruleset: "freeform" } });

    const paused = await findGameByChat(db, chatId);
    // Switching BACK hides nothing: the vocabulary stays, only the setting changes.
    expect(paused?.config.ruleset).toBe("freeform");
    expect(paused?.config.statProfile.attributes.map((a) => a.key)).toEqual(["str", "dex", "con", "int", "wis", "cha"]);
    expect(paused?.config.trackers.map((t) => t.key)).toEqual(["hp"]);

    await h.service.updateConfig({ principal: host, chatId, patch: { ruleset: "d20" } });
    const back = await findGameByChat(db, chatId);
    expect(back?.config.statProfile.attributes.map((a) => a.key)).toEqual(["str", "dex", "con", "int", "wis", "cha"]);
    expect(back?.config.trackers.map((t) => t.key)).toEqual(["hp"]);
  });

  test("re-sending the CURRENT ruleset resurrects nothing a host deleted (the apply is gated on a CHANGE)", async () => {
    const { chatId, h } = await seedLiteGame(db);
    const host = principal(castId<Handle>("host"));
    await h.service.updateConfig({ principal: host, chatId, patch: { ruleset: "d20" } });
    // The host deletes the seeded meter, then makes an unrelated edit that re-sends the same ruleset.
    await h.service.updateConfig({ principal: host, chatId, patch: { trackers: [] } });
    await h.service.updateConfig({ principal: host, chatId, patch: { ruleset: "d20", steeringNote: "lean dark" } });

    const game = await findGameByChat(db, chatId);
    expect(game?.config.trackers).toEqual([]);
    expect(game?.config.lite.steeringNote).toBe("lean dark");
  });

  test("an unrelated config write never disturbs the ruleset (keep-on-omit, like every sibling knob)", async () => {
    const { chatId, h } = await seedLiteGame(db);
    const host = principal(castId<Handle>("host"));
    await h.service.updateConfig({ principal: host, chatId, patch: { ruleset: "d20" } });
    await h.service.updateConfig({ principal: host, chatId, patch: { steeringNote: "unrelated" } });
    expect((await findGameByChat(db, chatId))?.config.ruleset).toBe("d20");
  });
});

describe("updateConfig — knobs + profile mutability", () => {
  test("sets the gmPresetId + extractionMode knobs (both validated)", async () => {
    const { chatId, h } = await seedLiteGame(db);
    const preset = await seedPreset(db, "gm1", "presetowner");
    await h.service.updateConfig({
      principal: principal(castId<Handle>("host")),
      chatId,
      gmPresetId: preset,
      extractionMode: "cheap",
      patch: { steeringNote: "lean dark" },
    });
    const game = await findGameByChat(db, chatId);
    expect(game?.gmPresetId).toBe(preset);
    expect(game?.config.lite.steeringNote).toBe("lean dark");
    expect(game?.config.extractionMode).toBe("cheap");
  });

  test("THE TRACKERS write door — the whole set lands in ONE home, and an unrelated edit never wipes it", async () => {
    const { chatId, h } = await seedLiteGame(db);
    const trackers = [
      rpgTrackerDefSchema.parse({ key: "suspicion", label: "Suspicion", shape: "meter", write: "set", subject: "actor", appliesTo: "npcs", max: 10 }),
      rpgTrackerDefSchema.parse({ key: "alarm", label: "Alarm", shape: "meter", write: "set", subject: "game", max: 100 }),
    ];
    await h.service.updateConfig({
      principal: principal(castId<Handle>("host")),
      chatId,
      patch: { trackers, relationshipHints: { vassal: "sworn but resentful" } },
    });
    const game = await findGameByChat(db, chatId);
    expect(game?.config.trackers).toEqual(trackers);
    expect(game?.config.features.relationshipHints).toEqual({ vassal: "sworn but resentful" });
    // Omit keeps them — the [versioned-config-lift-drops-overrides] trap: this is the ONLY tracker-def door,
    // so an unrelated `steeringNote` write that dropped `trackers` would silently delete every def.
    await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { steeringNote: "x" } });
    expect((await findGameByChat(db, chatId))?.config.trackers).toHaveLength(2);
  });

  test("WAVE MU: the GAME's user macros write through this door, whole-list replace + keep-on-omit", async () => {
    const { chatId, h } = await seedLiteGame(db);
    expect((await findGameByChat(db, chatId))?.config.userMacros).toEqual([]); // born empty (the schema default)

    const userMacros = [
      userMacroSchema.parse({
        name: "mood",
        description: "the game's scene tone",
        body: "The tone is {{tone}}.",
        inputs: [{ kind: "single-select", name: "tone", label: "Tone", options: [{ label: "Doomed", value: "doomed" }], defaultValue: "doomed" }],
      }),
    ];
    await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { userMacros } });
    expect((await findGameByChat(db, chatId))?.config.userMacros).toEqual(userMacros);

    // Keep-on-omit — the [versioned-config-lift-drops-overrides] trap: an unrelated edit must not wipe them.
    await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { steeringNote: "z" } });
    expect((await findGameByChat(db, chatId))?.config.userMacros).toEqual(userMacros);

    // A passed array REPLACES the whole set (the `trackers` semantics) — including back to none.
    await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { userMacros: [] } });
    expect((await findGameByChat(db, chatId))?.config.userMacros).toEqual([]);
  });

  test("PROSE-1 re-home: this door has NO prose arm, and a wire-level `prose` patch writes nothing", async () => {
    // Owner ruling 2026-08-08 ("we are putting everything in presets"): the teach/heading overrides are
    // `promptConfig.prose`. This verb kept a `patch.prose` arm for one merge. The pin is the WIRE-tier refusal,
    // not just the type: a client that still sends the old key (a stale build, a hand-rolled call) must leave no
    // trace on the game row — a second storage that quietly accepts writes nobody reads is exactly the defect
    // the ruling closes, and it would read as "the host's edit vanished" in the product.
    const { chatId, h } = await seedLiteGame(db);
    const parsed = rpgUpdateConfigInputSchema.parse({
      chatId,
      patch: { steeringNote: "z", prose: { "rpg.reminder.steeringLicense": { text: "our table's own license", baseVersion: 1 } } },
    });
    expect(Object.hasOwn(parsed.patch ?? {}, "prose")).toBe(false);

    await h.service.updateConfig({ principal: principal(castId<Handle>("host")), ...parsed });
    const config: Record<string, unknown> = (await findGameByChat(db, chatId))?.config ?? {};
    expect(Object.hasOwn(config, "prose")).toBe(false);
    expect((await findGameByChat(db, chatId))?.config.lite.steeringNote).toBe("z"); // the real arms still write
  });

  test("R4c: the custom-journal-type hints are keep-on-omit like every sibling knob", async () => {
    const { chatId, h } = await seedLiteGame(db);
    await h.service.updateConfig({
      principal: principal(castId<Handle>("host")),
      chatId,
      patch: { journalTypeHints: { ritual: "a binding performed aloud" } },
    });
    expect((await findGameByChat(db, chatId))?.config.features.journalTypeHints).toEqual({ ritual: "a binding performed aloud" });
    await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { steeringNote: "y" } });
    expect((await findGameByChat(db, chatId))?.config.features.journalTypeHints).toEqual({ ritual: "a binding performed aloud" });
  });

  test("M4 hiddenContentReveal: the host can turn their OWN reveal eye off, and an unrelated edit never turns it back on", async () => {
    const { chatId, h } = await seedLiteGame(db);
    expect((await findGameByChat(db, chatId))?.config.features.hiddenContentReveal).toBe(true);
    await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { hiddenContentReveal: false } });
    expect((await findGameByChat(db, chatId))?.config.features.hiddenContentReveal).toBe(false);
    // The knob's whole point is a PURE-hidden posture the host chose; a steeringNote edit silently restoring
    // the eye would hand them back the peek they deliberately gave up.
    await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { steeringNote: "blind too" } });
    expect((await findGameByChat(db, chatId))?.config.features.hiddenContentReveal).toBe(false);
  });

  test("§1.3 extraction-depth trio: context/window budget/reconcile cadence all land, and each survives an unrelated edit", async () => {
    const { chatId, h } = await seedLiteGame(db);
    // Born defaults (the ratified round-1 owner values).
    let game = await findGameByChat(db, chatId);
    expect(game?.config.extractionContext).toBe("window");
    expect(game?.config.extractionWindowTokens).toBe(4096);
    expect(game?.config.reconcileEveryBeats).toBe(10);
    await h.service.updateConfig({
      principal: principal(castId<Handle>("host")),
      chatId,
      patch: { extractionContext: "full", extractionWindowTokens: 8192, reconcileEveryBeats: 0 },
    });
    game = await findGameByChat(db, chatId);
    expect(game?.config.extractionContext).toBe("full");
    expect(game?.config.extractionWindowTokens).toBe(8192);
    expect(game?.config.reconcileEveryBeats).toBe(0);
    // Keep-on-omit ([versioned-config-lift-drops-overrides]): `reconcileEveryBeats: 0` is the trap value — a
    // merge written with `??` on a falsy-check instead of an undefined-check would silently restore the
    // every-10-beats cadence (and its cost) on the next unrelated write.
    await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { steeringNote: "unrelated" } });
    game = await findGameByChat(db, chatId);
    expect(game?.config.extractionContext).toBe("full");
    expect(game?.config.extractionWindowTokens).toBe(8192);
    expect(game?.config.reconcileEveryBeats).toBe(0);
  });

  test("#40 engaged toggle: OFF disengages + re-writes the pointer mirror; survives an unrelated edit; ON restores", async () => {
    const { chatId, h } = await seedLiteGame(db);
    // Born engaged (the createGame pointer carries engaged:true).
    expect((await findGameByChat(db, chatId))?.config.engaged).toBe(true);
    await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { engaged: false } });
    expect((await findGameByChat(db, chatId))?.config.engaged).toBe(false);
    // The pointer MIRROR was re-written (createGame's birth write + the flip).
    expect(h.fakes.pointers.at(-1)).toEqual({ chatId, gameId: (await findGameByChat(db, chatId))?.id, engaged: false });
    // NEVER-RESET: an unrelated config write must not silently re-engage the game.
    await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { steeringNote: "still off" } });
    expect((await findGameByChat(db, chatId))?.config.engaged).toBe(false);
    // Reversible: ON restores (the rows were never touched).
    await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { engaged: true } });
    expect((await findGameByChat(db, chatId))?.config.engaged).toBe(true);
  });

  test("#723 retry after the config commit repairs the engaged pointer mirror", async () => {
    const { chatId, h } = await seedLiteGame(db);
    h.fakes.pointerFailuresRemaining = 1;

    await expect(h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { engaged: false } })).rejects.toThrow(
      "injected pointer mirror interruption",
    );
    // The interruption is deliberately AFTER the first durable step.
    expect((await findGameByChat(db, chatId))?.config.engaged).toBe(false);
    expect(h.fakes.pointers.at(-1)?.engaged).toBe(true);

    await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { engaged: false } });
    expect((await findGameByChat(db, chatId))?.config.engaged).toBe(false);
    expect(h.fakes.pointers.at(-1)).toEqual({ chatId, gameId: (await findGameByChat(db, chatId))?.id, engaged: false });
  });

  test("#9 dateMode: defaults narrated; structured sets + survives an unrelated edit (never-reset)", async () => {
    const { chatId, h } = await seedLiteGame(db);
    expect((await findGameByChat(db, chatId))?.config.dateMode).toBe("narrated");
    await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { dateMode: "structured" } });
    expect((await findGameByChat(db, chatId))?.config.dateMode).toBe("structured");
    await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { steeringNote: "unrelated" } });
    expect((await findGameByChat(db, chatId))?.config.dateMode).toBe("structured");
  });

  test("sets the P3 hidden-channel knobs; an OMITTED knob KEEPS its value (deception survives an unrelated edit)", async () => {
    const { chatId, h } = await seedLiteGame(db);
    // Turn deception on + set the recent-beats cap.
    await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { deception: true, recentBeatsKeepLast: 3 } });
    let game = await findGameByChat(db, chatId);
    expect(game?.config.features.deception).toBe(true);
    expect(game?.config.features.recentBeatsKeepLast).toBe(3);
    // The load-bearing keep-on-omit: a later patch that touches ONLY the steeringNote must NOT reset deception
    // (or the reasoning-strip that rides it) to its default — the schema `.parse` would otherwise wipe it.
    await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { steeringNote: "grim" } });
    game = await findGameByChat(db, chatId);
    expect(game?.config.features.deception).toBe(true);
    expect(game?.config.features.recentBeatsKeepLast).toBe(3);
    expect(game?.config.features.hiddenContentReveal).toBe(true); // M4 default preserved
  });

  test("sets the P4 card knobs; an unrelated patch never resets an unnamed knob (§9 #7 + M2/M3)", async () => {
    const { chatId, h } = await seedLiteGame(db);
    await h.service.updateConfig({
      principal: principal(castId<Handle>("host")),
      chatId,
      patch: { immersiveHtml: false, immersiveHtmlInteractive: false, cardKeepLastX: 2 },
    });
    let game = await findGameByChat(db, chatId);
    expect(game?.config.features.immersiveHtml).toBe(false);
    expect(game?.config.features.immersiveHtmlInteractive).toBe(false);
    expect(game?.config.features.cardKeepLastX).toBe(2);
    // The preserve pin ([versioned-config-lift-drops-overrides] class): a later patch naming OTHER knobs
    // carries the card knobs through unchanged — a config write can never silently reset them to defaults.
    await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { steeringNote: "keep going" } });
    game = await findGameByChat(db, chatId);
    expect(game?.config.features.immersiveHtml).toBe(false);
    expect(game?.config.features.cardKeepLastX).toBe(2);
  });

  test("sets the P5 play-style knobs (cyoa/cyoaChoiceBehavior/plotProgression); an unrelated patch never resets them (§5.4/§6.4)", async () => {
    const { chatId, h } = await seedLiteGame(db);
    // Defaults at birth: cyoa OFF (a strong play-style), cyoaChoiceBehavior "compose" (lower-commitment
    // default), plotProgression ON (unobtrusive, click-only).
    let game = await findGameByChat(db, chatId);
    expect(game?.config.features.cyoa).toBe(false);
    expect(game?.config.features.cyoaChoiceBehavior).toBe("compose");
    expect(game?.config.features.plotProgression).toBe(true);
    // Flip all three away from their defaults.
    await h.service.updateConfig({
      principal: principal(castId<Handle>("host")),
      chatId,
      patch: { cyoa: true, cyoaChoiceBehavior: "send", plotProgression: false },
    });
    game = await findGameByChat(db, chatId);
    expect(game?.config.features.cyoa).toBe(true);
    expect(game?.config.features.cyoaChoiceBehavior).toBe("send");
    expect(game?.config.features.plotProgression).toBe(false);
    // The never-reset pin ([versioned-config-lift-drops-overrides] class): an unrelated write keeps all.
    await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { steeringNote: "onward" } });
    game = await findGameByChat(db, chatId);
    expect(game?.config.features.cyoa).toBe(true);
    expect(game?.config.features.cyoaChoiceBehavior).toBe("send");
    expect(game?.config.features.plotProgression).toBe(false);
  });

  test("an explicit null gmPresetId clears back to augment", async () => {
    const { chatId, h } = await seedLiteGame(db);
    const preset = await seedPreset(db, "x", "pox");
    await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, gmPresetId: preset });
    await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, gmPresetId: null });
    expect((await findGameByChat(db, chatId))?.gmPresetId).toBeNull();
  });

  test("an invalid extractionMode is refused (the knob is validated)", async () => {
    const { chatId, h } = await seedLiteGame(db);
    await expect(h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "sloppy" })).rejects.toThrow(EXTRACTION_RE);
  });

  test("profile mutability: an ADD is legal", async () => {
    const { chatId, h } = await seedLiteGame(db);
    await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { statProfile: RPG_PROFILE_D20 } });
    expect((await findGameByChat(db, chatId))?.config.statProfile.attributes).toHaveLength(6);
  });

  test("profile mutability: a REFERENCED remove is REFUSED", async () => {
    const { chatId, h } = await seedLiteGame(db);
    const host = await seedUser(db, castId<Handle>("host")); // the sheet FKs users.id
    await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { statProfile: RPG_PROFILE_D20 } });
    await h.service.patchSheet({
      principal: principal(castId<Handle>("host")),
      chatId,
      actorRef: { kind: "user", userId: host },
      patch: { attributes: { str: 12 } },
    });
    await expect(
      h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { statProfile: RPG_PROFILE_FREEFORM } }),
    ).rejects.toThrow(REFERENCED_RE);
  });

  // ── the profile/tracker COHERENCE floor (#1371 items 2/3) ──────────────────────────────────────────
  // These are refused HERE, at the producer verb, and deliberately NOT as zod refines: the whole
  // `rpgGameConfigSchema` is parse-on-read (`parseGameRow` → `RpgStateCorruptError`), so a schema-level
  // bound would not reject a bad write — it would make every already-stored blob that predates the rule
  // permanently unreadable. `assertProfileCoherent`/`assertTrackersCoherent` close the state going forward
  // without bricking a stored game; the contract headers record the trade.

  test("a DUPLICATE attribute key is refused — a sheet's record can only hold one", async () => {
    const { chatId, h } = await seedLiteGame(db);
    const dup = { ...RPG_PROFILE_D20, attributes: [...RPG_PROFILE_D20.attributes, { key: "str", label: "Might", hint: "" }] };
    await expect(h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { statProfile: dup } })).rejects.toThrow(
      /declared twice/i,
    );
  });

  test("an INVERTED range is refused", async () => {
    const { chatId, h } = await seedLiteGame(db);
    const inverted = { ...RPG_PROFILE_D20, range: { min: 20, max: 1 } };
    await expect(h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { statProfile: inverted } })).rejects.toThrow(
      /exceeds max/i,
    );
  });

  test("a defaultAttribute naming an UNDECLARED key is refused; the empty 'unset' spelling stays legal", async () => {
    const { chatId, h } = await seedLiteGame(db);
    const host = principal(castId<Handle>("host"));
    const dangling = { ...RPG_PROFILE_D20, defaultAttribute: "gone" };
    await expect(h.service.updateConfig({ principal: host, chatId, patch: { statProfile: dangling } })).rejects.toThrow(/undeclared attribute/i);
    // `freeform` ships both keys empty — the packaged profile must still be writable.
    await h.service.updateConfig({ principal: host, chatId, patch: { statProfile: RPG_PROFILE_FREEFORM } });
    expect((await findGameByChat(db, chatId))?.config.statProfile.defaultAttribute).toBe("");
  });

  test("a DUPLICATE tracker key is refused — the def a stored value belongs to must be unambiguous", async () => {
    const { chatId, h } = await seedLiteGame(db);
    const def = (key: string): unknown => ({ key, label: key, shape: "meter", write: "delta", subject: "actor", appliesTo: "party" });
    await expect(
      h.service.updateConfig({
        principal: principal(castId<Handle>("host")),
        chatId,
        patch: { trackers: [rpgTrackerDefSchema.parse(def("grit")), rpgTrackerDefSchema.parse(def("grit"))] },
      }),
    ).rejects.toThrow(/defined twice/i);
  });

  test("the tracker COUNT cap is refused past RPG_CONFIG_MAX_TRACKERS, and accepted at it", async () => {
    const { chatId, h } = await seedLiteGame(db);
    const host = principal(castId<Handle>("host"));
    const many = (n: number): unknown[] =>
      Array.from({ length: n }, (_, i) =>
        rpgTrackerDefSchema.parse({ key: `t${i}`, label: `T${i}`, shape: "meter", write: "delta", subject: "actor", appliesTo: "party" }),
      );
    await h.service.updateConfig({ principal: host, chatId, patch: { trackers: many(RPG_CONFIG_MAX_TRACKERS) as never } });
    expect((await findGameByChat(db, chatId))?.config.trackers.length).toBe(RPG_CONFIG_MAX_TRACKERS);
    await expect(h.service.updateConfig({ principal: host, chatId, patch: { trackers: many(RPG_CONFIG_MAX_TRACKERS + 1) as never } })).rejects.toThrow(
      /exceeds the cap/i,
    );
  });

  test("a non-member cannot updateConfig (leak-free)", async () => {
    const { chatId, h } = await seedLiteGame(db);
    await expect(h.service.updateConfig({ principal: principal(castId<Handle>("intruder")), chatId, patch: { steeringNote: "x" } })).rejects.toThrow();
  });
});
