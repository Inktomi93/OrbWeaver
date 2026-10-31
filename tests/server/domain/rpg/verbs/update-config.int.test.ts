// The config write door: an unrelated write never resets a knob the host tuned, a ruleset change merges additively
// and only on a change, an incoherent vocabulary is refused before it is stored, and the engaged flip repairs its
// chat pointer mirror on retry.
// @subject packages/server/src/domain/rpg/verbs/game/update-config.ts

import { userMacroSchema } from "@orb/contracts/preset";
import type { RpgConfigView } from "@orb/contracts/rpg";
import { applyRulesetVocabulary, RPG_CONFIG_MAX_TRACKERS, RPG_PROFILE_D20, RPG_RULESET_PROFILE, rpgTrackerDefSchema } from "@orb/contracts/rpg";
import { chats } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { refuseWrites, seedRecallRoom, seedRpgGame } from "@orb/testkit/node/composed";
import { RPG_OP_CODES } from "#server/domain/rpg/contract/op-codes.ts";

type Patch = NonNullable<Parameters<ServerTestHarness["services"]["rpg"]["updateConfig"]>[0]["patch"]>;

const grit = rpgTrackerDefSchema.parse({ key: "grit", label: "Grit", shape: "meter", write: "delta", subject: "actor", appliesTo: "party" });

async function liteGame(root: ServerTestHarness): Promise<{
  readonly host: Awaited<ReturnType<ServerTestHarness["principalFor"]>>;
  readonly chatId: Awaited<ReturnType<typeof seedRecallRoom>>;
  readonly update: (patch: Patch) => Promise<void>;
  readonly config: () => Promise<RpgConfigView>;
}> {
  const host = await root.principalFor(root.ownerId);
  const chatId = await seedRecallRoom(await root.internalCallerFor(host.userId));
  await seedRpgGame(root, { principal: host, chatId, mode: "lite" });
  return {
    host,
    chatId,
    update: (patch) => root.services.rpg.updateConfig({ principal: host, chatId, patch }),
    config: () => root.services.rpg.getConfigView({ principal: host, chatId }),
  };
}

// Every config view field is either tuned here or named in UNTUNED as owned by another case below, so a field the
// view gains fails `tsc` until it has a write.
const UNTUNED = ["statProfile", "ruleset", "steeringNote", "gmPresetId", "extractionMode", "presetMacroNames"] as const;
type TunedKnob = Exclude<keyof RpgConfigView, (typeof UNTUNED)[number]>;
interface Knob {
  readonly patch: Patch;
  readonly read: (view: RpgConfigView) => unknown;
}
// A knob's patch carries exactly that one field, so its written value is the patch's only value.
const written = (knob: Knob): unknown => Object.values(knob.patch)[0];

// Each row writes a value the born config does not hold, so the first read proves the write landed before the
// unrelated write proves it was kept. `reconcileEveryBeats: 0` is the falsy value a `||` merge would restore.
const KNOBS: Readonly<Record<TunedKnob, Knob>> = {
  deception: { patch: { deception: true }, read: (view) => view.deception },
  omniscience: { patch: { omniscience: true }, read: (view) => view.omniscience },
  hiddenContentReveal: { patch: { hiddenContentReveal: false }, read: (view) => view.hiddenContentReveal },
  recentBeatsKeepLast: { patch: { recentBeatsKeepLast: 3 }, read: (view) => view.recentBeatsKeepLast },
  immersiveHtml: { patch: { immersiveHtml: false }, read: (view) => view.immersiveHtml },
  immersiveHtmlInteractive: { patch: { immersiveHtmlInteractive: false }, read: (view) => view.immersiveHtmlInteractive },
  cardKeepLastX: { patch: { cardKeepLastX: 2 }, read: (view) => view.cardKeepLastX },
  cyoa: { patch: { cyoa: true }, read: (view) => view.cyoa },
  cyoaChoiceBehavior: { patch: { cyoaChoiceBehavior: "send" }, read: (view) => view.cyoaChoiceBehavior },
  plotProgression: { patch: { plotProgression: false }, read: (view) => view.plotProgression },
  relationshipHints: { patch: { relationshipHints: { vassal: "sworn but resentful" } }, read: (view) => view.relationshipHints },
  journalTypeHints: { patch: { journalTypeHints: { ritual: "a binding performed aloud" } }, read: (view) => view.journalTypeHints },
  extractionContext: { patch: { extractionContext: "full" }, read: (view) => view.extractionContext },
  extractionWindowTokens: { patch: { extractionWindowTokens: 8192 }, read: (view) => view.extractionWindowTokens },
  reconcileEveryBeats: { patch: { reconcileEveryBeats: 0 }, read: (view) => view.reconcileEveryBeats },
  stateCaptureVehicle: { patch: { stateCaptureVehicle: "structured" }, read: (view) => view.stateCaptureVehicle },
  dateMode: { patch: { dateMode: "structured" }, read: (view) => view.dateMode },
  trackers: { patch: { trackers: [grit] }, read: (view) => view.trackers },
  userMacros: {
    patch: { userMacros: [userMacroSchema.parse({ name: "mood", description: "the scene tone", body: "The tone is {{tone}}." })] },
    read: (view) => view.userMacros,
  },
};

test("an unrelated config write keeps every knob the host tuned", async ({ harness }) => {
  const game = await liteGame(harness);
  const born = await game.config();
  for (const [name, knob] of Object.entries(KNOBS)) {
    expect(knob.read(born), `${name} must differ from its born value for the write to be observable`).not.toEqual(written(knob));
    await game.update(knob.patch);
  }
  const tuned = await game.config();
  for (const [name, knob] of Object.entries(KNOBS)) {
    expect(knob.read(tuned), `${name} after its own write`).toEqual(written(knob));
  }
  await game.update({ steeringNote: "unrelated" });
  const after = await game.config();
  expect(after.steeringNote).toBe("unrelated");
  for (const [name, knob] of Object.entries(KNOBS)) {
    expect(knob.read(after), `${name} after an unrelated write`).toEqual(written(knob));
  }
});

test("a passed tracker or macro list replaces the whole set, including back to none", async ({ harness }) => {
  const game = await liteGame(harness);
  await game.update({ trackers: [grit], userMacros: [userMacroSchema.parse({ name: "mood", description: "tone", body: "The tone is {{tone}}." })] });
  expect((await game.config()).trackers).toHaveLength(1);
  await game.update({ trackers: [], userMacros: [] });
  const cleared = await game.config();
  expect(cleared.trackers).toEqual([]);
  expect(cleared.userMacros).toEqual([]);
});

test("a ruleset change merges its vocabulary beside the host's own, and only on a change", async ({ harness }) => {
  const game = await liteGame(harness);
  await game.update({ trackers: [grit] });
  const before = await game.config();
  const merged = applyRulesetVocabulary({ statProfile: before.statProfile, trackers: before.trackers }, "d20");

  await game.update({ ruleset: "d20" });
  const d20 = await game.config();
  expect(d20.ruleset).toBe("d20");
  expect(d20.statProfile.attributes.map((attribute) => attribute.key)).toEqual(RPG_PROFILE_D20.attributes.map((attribute) => attribute.key));
  expect(d20.trackers.map((tracker) => tracker.key)).toEqual(merged.trackers.map((tracker) => tracker.key));
  expect(d20.trackers[0]?.key).toBe(grit.key);
  expect(d20.trackers.length).toBeGreaterThan(1);

  // Switching away hides nothing, and switching back adds nothing twice.
  await game.update({ ruleset: "freeform" });
  await game.update({ ruleset: "d20" });
  const back = await game.config();
  expect(back.statProfile.attributes).toEqual(d20.statProfile.attributes);
  expect(back.trackers).toEqual(d20.trackers);

  // Re-sending the current ruleset resurrects nothing the host deleted.
  await game.update({ trackers: [] });
  await game.update({ ruleset: "d20", steeringNote: "lean dark" });
  const resent = await game.config();
  expect(resent.trackers).toEqual([]);
  expect(resent.steeringNote).toBe("lean dark");
});

test("an incoherent vocabulary is refused and leaves the stored config unchanged", async ({ harness }) => {
  const game = await liteGame(harness);
  await game.update({ statProfile: RPG_PROFILE_D20 });
  const stored = await game.config();
  const tracker = (key: string): ReturnType<typeof rpgTrackerDefSchema.parse> =>
    rpgTrackerDefSchema.parse({ key, label: key, shape: "meter", write: "delta", subject: "actor", appliesTo: "party" });
  const [first] = RPG_PROFILE_D20.attributes;
  if (first === undefined) {
    throw new Error("the packaged d20 profile declares no attribute");
  }
  const many = (count: number): ReturnType<typeof rpgTrackerDefSchema.parse>[] => Array.from({ length: count }, (_, index) => tracker(`t${String(index)}`));
  const refusals: readonly { readonly code: string; readonly patch: Patch }[] = [
    { code: RPG_OP_CODES.profileDuplicateAttribute, patch: { statProfile: { ...RPG_PROFILE_D20, attributes: [...RPG_PROFILE_D20.attributes, first] } } },
    { code: RPG_OP_CODES.profileInvertedRange, patch: { statProfile: { ...RPG_PROFILE_D20, range: { min: 20, max: 1 } } } },
    { code: RPG_OP_CODES.profileDanglingAttribute, patch: { statProfile: { ...RPG_PROFILE_D20, defaultAttribute: "undeclared" } } },
    { code: RPG_OP_CODES.duplicateTrackerKey, patch: { trackers: [tracker("grit"), tracker("grit")] } },
    { code: RPG_OP_CODES.tooManyTrackers, patch: { trackers: many(RPG_CONFIG_MAX_TRACKERS + 1) } },
  ];
  for (const refusal of refusals) {
    await expect(game.update(refusal.patch)).rejects.toMatchObject({ code: refusal.code });
    expect(await game.config()).toEqual(stored);
  }
  // Controls: the cap itself and the declared "unset" spelling stay writable.
  await game.update({ trackers: many(RPG_CONFIG_MAX_TRACKERS) });
  expect((await game.config()).trackers).toHaveLength(RPG_CONFIG_MAX_TRACKERS);
  await game.update({ statProfile: RPG_RULESET_PROFILE.freeform });
  expect((await game.config()).statProfile.defaultAttribute).toBe("");
});

test("removing an attribute a sheet still carries is refused, adding one is not", async ({ harness }) => {
  const game = await liteGame(harness);
  await game.update({ statProfile: RPG_PROFILE_D20 });
  await harness.services.rpg.patchSheet({
    principal: game.host,
    chatId: game.chatId,
    actorRef: { kind: "user", userId: game.host.userId },
    patch: { attributes: { [RPG_PROFILE_D20.attributes[0]?.key ?? ""]: 12 } },
  });
  await expect(game.update({ statProfile: RPG_RULESET_PROFILE.freeform })).rejects.toMatchObject({ code: RPG_OP_CODES.profileReferencedRemove });
  expect((await game.config()).statProfile.attributes).toHaveLength(RPG_PROFILE_D20.attributes.length);
  await game.update({ statProfile: { ...RPG_PROFILE_D20, attributes: [...RPG_PROFILE_D20.attributes, { key: "luck", label: "Luck", hint: "" }] } });
  expect((await game.config()).statProfile.attributes).toHaveLength(RPG_PROFILE_D20.attributes.length + 1);
});

test("an unknown extraction mode is refused", async ({ harness }) => {
  const game = await liteGame(harness);
  const before = await game.config();
  await expect(harness.services.rpg.updateConfig({ principal: game.host, chatId: game.chatId, extractionMode: "sloppy" })).rejects.toMatchObject({
    code: RPG_OP_CODES.invalidExtractionMode,
  });
  expect(await game.config()).toEqual(before);
  await harness.services.rpg.updateConfig({ principal: game.host, chatId: game.chatId, extractionMode: before.extractionMode });
});

test("the preset override is set by id, kept by an unrelated write and cleared by an explicit null", async ({ harness }) => {
  const game = await liteGame(harness);
  const preset = await (await harness.internalCallerFor(game.host.userId)).preset.create({ name: "Game master", kind: "chat" });
  const write = (knobs: { readonly gmPresetId?: typeof preset.id | null }): Promise<void> =>
    harness.services.rpg.updateConfig({ principal: game.host, chatId: game.chatId, ...knobs });

  expect((await game.config()).gmPresetId).toBeNull();
  await write({ gmPresetId: preset.id });
  expect((await game.config()).gmPresetId).toBe(preset.id);
  await game.update({ steeringNote: "unrelated" });
  expect((await game.config()).gmPresetId).toBe(preset.id);
  await write({ gmPresetId: null });
  expect((await game.config()).gmPresetId).toBeNull();
});

test("the engaged flip survives an unrelated write and a retry repairs an interrupted pointer mirror", async ({ harness, db }) => {
  const game = await liteGame(harness);
  const pointer = async (): Promise<boolean | undefined> => (await harness.services.chat.getChat({ principal: game.host, chatId: game.chatId })).rpg?.engaged;
  expect((await game.config()).steeringNote).toBe("");
  expect(await pointer()).toBe(true);

  await game.update({ engaged: false });
  expect(await pointer()).toBe(false);
  await game.update({ steeringNote: "still off" });
  expect(await pointer()).toBe(false);
  await game.update({ engaged: true });
  expect(await pointer()).toBe(true);

  // The interruption lands after the config commit and before the pointer write.
  await using fault = await refuseWrites(db, { table: chats, event: "UPDATE", message: "pointer mirror interrupted", columns: [chats.metadata] });
  await expect(game.update({ engaged: false })).rejects.toThrow("pointer mirror interrupted");
  expect(await pointer()).toBe(true);
  await fault.lift();
  await game.update({ engaged: false });
  expect(await pointer()).toBe(false);
});
