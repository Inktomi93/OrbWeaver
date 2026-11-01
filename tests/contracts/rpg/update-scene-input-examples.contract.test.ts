// @subject packages/contracts/src/rpg/extraction-prompt.ts
import type { ExtractionRefs } from "@orb/contracts/rpg";
import { buildToolRoundWireTools, rpgGameConfigSchema, toolCallsToExtraction } from "@orb/contracts/rpg";
import { expect, test } from "@orb/testkit/node";

const REFS: ExtractionRefs = {
  actorRefs: ["Mira"],
  trackerWriteGroups: [],
  gameTrackerKeys: { deltaKeys: [], setKeys: [] },
  conditionNames: [],
  establishScene: { location: false, timeOfDay: false, presentCast: false },
};

test("every update_scene input example survives the tool's own argument parse unchanged, and no other tool carries examples", () => {
  const tools = buildToolRoundWireTools(REFS, rpgGameConfigSchema.parse({}), {});
  const scene = tools.find((tool) => tool.name === "update_scene");
  expect(scene?.inputExamples?.length).toBeGreaterThan(0);
  for (const example of scene?.inputExamples ?? []) {
    const parsed = toolCallsToExtraction([{ name: "update_scene", arguments: JSON.stringify(example) }]);
    expect(parsed.scene).toEqual(example);
  }
  expect(tools.filter((tool) => tool.name !== "update_scene" && tool.inputExamples !== undefined)).toEqual([]);
});
