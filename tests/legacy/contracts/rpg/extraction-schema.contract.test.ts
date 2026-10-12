// @orb/contracts/rpg/extraction — the extraction schema projects, defaults and derives from the tool arg shapes.

import { rpgExtractionSchema, updatePartyArgsSchema } from "@orb/contracts/rpg";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { z } from "zod";

test("the extraction schema projects to JSON Schema without throwing (the output_config.format class)", () => {
  expect(() => z.toJSONSchema(rpgExtractionSchema)).not.toThrow();
});

test("an empty object is a valid 'nothing changed this turn' extraction (all fields default empty)", () => {
  const parsed = rpgExtractionSchema.parse({});
  expect(parsed).toEqual({ party: [], inventory: [], trackers: [], quests: [], journal: [] });
});

test("LEVEL is UNREACHABLE from the model (§2.6 hand-only) — absent from the projected extraction schema AND tool args", () => {
  // The whole projected schema serialized — `level` must not appear as a writable property anywhere (the
  // extraction reaches every model-writable plane, so its absence proves level is model-unwritable). A `level`
  // reachable through a tool arg or the extraction would be the progression-inflation footgun §2.6 forbids.
  const schemaJson = JSON.stringify(projectJsonSchema(rpgExtractionSchema));
  expect(schemaJson).not.toContain("level");
});

test("PLOT is MODEL-REACHABLE via scene.plot (P5) — present in the projected schema as the flat patch shape", () => {
  // Schema-string PRESENCE is the proof the structured path can write the plane (the same lens that proves
  // level's absence): the extraction derives from `update_scene` args, so the plot patch rides for free.
  const schemaJson = JSON.stringify(projectJsonSchema(rpgExtractionSchema));
  expect(schemaJson).toContain('"plot"');
  expect(schemaJson).toContain('"actTitle"');
  const parsed = rpgExtractionSchema.parse({ scene: { plot: { act: 2, title: "The Bone Key", actTitle: "Descent" } } });
  expect(parsed.scene?.plot).toEqual({ act: 2, title: "The Bone Key", actTitle: "Descent" });
});

test("the party field DERIVES from update_party args (the shared-plane proof)", () => {
  // The same object that parses as `update_party` args parses as one `party` entry — the extraction is a batch
  // of the tool calls the model would otherwise have made.
  const toolArgs = { targetRef: "Hero", hpDelta: -3, poolDeltas: [{ name: "mana", delta: -1 }] };
  const asTool = updatePartyArgsSchema.parse(toolArgs);
  const asExtraction = rpgExtractionSchema.parse({ party: [toolArgs] });
  expect(asExtraction.party[0]).toEqual(asTool);
});

test("scene is a single optional object, not an array (one scene per turn)", () => {
  const parsed = rpgExtractionSchema.parse({ scene: { location: "The Docks", timeOfDay: "night" } });
  expect(parsed.scene?.location).toBe("The Docks");
  expect(parsed.scene?.timeOfDay).toBe("night");
});

test("the full 7-plane delta parses as one object", () => {
  const parsed = rpgExtractionSchema.parse({
    party: [{ targetRef: "Hero", status: "wounded" }],
    inventory: [{ targetRef: "Hero", walletDeltas: [{ name: "gold", delta: 25 }] }],
    scene: { recentEvent: "The gate opened." },
    widgets: [{ widgetRef: "Corruption", value: 70 }],
    quests: [{ name: "Find the key", action: "create" }],
    journal: [{ type: "event", label: "", title: "Arrival", content: "They reached the city." }],
  });
  expect(parsed.party).toHaveLength(1);
  expect(parsed.inventory[0]?.walletDeltas).toEqual([{ name: "gold", delta: 25 }]);
  expect(parsed.quests[0]?.action).toBe("create");
  expect(parsed.journal[0]?.type).toBe("event");
});
