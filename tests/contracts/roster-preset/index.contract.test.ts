import { applyRosterPresetResultSchema, rosterPresetSummarySchema, rosterPresetViewSchema } from "@orb/contracts/roster-preset";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures";

test("rosterPresetViewSchema round-trips a preset with ordered members + null anchor/config", () => {
  const view = {
    id: mintTypeId(ID_PREFIX.rosterPreset),
    name: "Tavern regulars",
    description: "",
    anchorPersonaId: null,
    groupConfig: null,
    members: [
      {
        characterId: mintTypeId(ID_PREFIX.character),
        position: 0,
        talkativeness: null,
        disabled: false,
      },
      {
        characterId: mintTypeId(ID_PREFIX.character),
        position: 1,
        talkativeness: 0.5,
        disabled: true,
      },
    ],
    createdAt: 1,
    updatedAt: 2,
  };
  expect(rosterPresetViewSchema.parse(view)).toEqual(view);
});

test("rosterPresetViewSchema rejects a non-branded id and an empty name", () => {
  const base = {
    id: mintTypeId(ID_PREFIX.rosterPreset),
    name: "x",
    description: "",
    anchorPersonaId: null,
    groupConfig: null,
    members: [],
    createdAt: 0,
    updatedAt: 0,
  };
  expect(rosterPresetViewSchema.safeParse({ ...base, id: "nope" }).success).toBe(false);
  expect(rosterPresetViewSchema.safeParse({ ...base, name: "" }).success).toBe(false);
});

test("rosterPresetSummarySchema carries the avatar-stack ids + count", () => {
  const summary = {
    id: mintTypeId(ID_PREFIX.rosterPreset),
    name: "Party A",
    description: "the crew",
    memberCount: 2,
    memberCharacterIds: [mintTypeId(ID_PREFIX.character), mintTypeId(ID_PREFIX.character)],
    createdAt: 1,
    updatedAt: 1,
  };
  expect(rosterPresetSummarySchema.parse(summary)).toEqual(summary);
});

test("applyRosterPresetResultSchema reports added / alreadyPresent / configApplied", () => {
  const result = {
    added: [mintTypeId(ID_PREFIX.character)],
    alreadyPresent: [mintTypeId(ID_PREFIX.character)],
    configApplied: true,
  };
  expect(applyRosterPresetResultSchema.parse(result)).toEqual(result);
});
