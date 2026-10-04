import { rpgConfigViewSchema, rpgGameConfigSchema, rpgTrackerViewSchema } from "@orb/contracts/rpg";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

test("resolved tracker output closes ambient children while retaining absent state", () => {
  const view = {
    ambient: { location: "Archive", calendarDate: null, clock: null, weather: null },
    actors: [],
    cast: [],
    trackerDefs: [],
    gameTrackers: [],
    quests: [],
    plot: null,
    recentBeats: ["The door opened."],
    trackersReadOnly: true,
    trackerOrbs: [],
    lockedPaths: [],
  };
  expect(rpgTrackerViewSchema.parse(view)).toEqual(view);
  expect(rpgTrackerViewSchema.parse({ ...view, ambient: null })).toEqual({ ...view, ambient: null });
  expect(rpgTrackerViewSchema.safeParse({ ...view, ambient: { ...view.ambient, gmSecret: "private" } }).success).toBe(false);
});

test("the produced config carries a native nullable preset pointer without altering stored defaults", () => {
  const config = rpgGameConfigSchema.parse({});
  const view = {
    statProfile: config.statProfile,
    ruleset: config.ruleset,
    extractionMode: config.extractionMode,
    extractionContext: config.extractionContext,
    stateCaptureVehicle: config.stateCaptureVehicle,
    extractionWindowTokens: config.extractionWindowTokens,
    reconcileEveryBeats: config.reconcileEveryBeats,
    dateMode: config.dateMode,
    trackers: config.trackers,
    userMacros: config.userMacros,
    steeringNote: config.lite.steeringNote,
    gmPresetId: null,
    ...config.features,
    presetMacroNames: [],
  };
  expect(rpgConfigViewSchema.parse(view)).toEqual(view);
  const gmPresetId = mintTypeId(ID_PREFIX.preset);
  expect(rpgConfigViewSchema.parse({ ...view, gmPresetId })).toEqual({ ...view, gmPresetId });
  expect(rpgConfigViewSchema.safeParse({ ...view, gmPresetId: mintTypeId(ID_PREFIX.chat) }).success).toBe(false);
  expect(rpgConfigViewSchema.safeParse({ ...view, statProfile: { ...view.statProfile, privateProfile: "private" } }).success).toBe(false);
});
