// @subject packages/contracts/src/rpg/extraction-prompt.ts
import type { ExtractionRefs } from "@orb/contracts/rpg";
import { buildToolRoundWireTools, rpgGameConfigSchema, toolCallsToExtraction, withStateToolExamples } from "@orb/contracts/rpg";
import { expect, test } from "@orb/testkit/node";
import { z } from "zod";

const ESTABLISH_STATES = [false, true].flatMap((location) =>
  [false, true].flatMap((timeOfDay) => [false, true].map((presentCast) => ({ location, timeOfDay, presentCast }))),
);

function refsFor(establishScene: ExtractionRefs["establishScene"]): ExtractionRefs {
  return { actorRefs: ["Mira"], trackerWriteGroups: [], gameTrackerKeys: { deltaKeys: [], setKeys: [] }, conditionNames: [], establishScene };
}

test("the plain state tools, which the folded turn mounts, carry no input examples; only the cheap round's attach them, to update_scene alone", () => {
  const plain = buildToolRoundWireTools(
    refsFor(ESTABLISH_STATES[0] ?? { location: false, timeOfDay: false, presentCast: false }),
    rpgGameConfigSchema.parse({}),
    {},
  );
  expect(plain.filter((tool) => tool.inputExamples !== undefined)).toEqual([]);
  expect(JSON.stringify(plain)).not.toContain("inputExamples");
  const withExamples = withStateToolExamples(plain);
  expect(withExamples.filter((tool) => tool.inputExamples !== undefined).map((tool) => tool.name)).toEqual(["update_scene"]);
  expect(withExamples.map(({ inputExamples: _examples, ...rest }) => rest)).toEqual(plain);
});

test("every update_scene input example survives the tool's own argument parse and validates against its constrained schema in every establish state", () => {
  for (const establishScene of ESTABLISH_STATES) {
    const scene = withStateToolExamples(buildToolRoundWireTools(refsFor(establishScene), rpgGameConfigSchema.parse({}), {})).find(
      (tool) => tool.name === "update_scene",
    );
    expect(scene?.inputExamples?.length).toBeGreaterThan(0);
    const schema = z.fromJSONSchema(scene?.parameters ?? {});
    for (const example of scene?.inputExamples ?? []) {
      expect(schema.safeParse(example).success, JSON.stringify({ establishScene, example })).toBe(true);
      expect(toolCallsToExtraction([{ name: "update_scene", arguments: JSON.stringify(example) }]).scene).toEqual(example);
    }
  }
});
