// @orb/contracts/rpg/extraction — the reliable-mode structured-output schema (rpg-design/05 §4.6). Pins: it
// PROJECTS to JSON Schema without throwing (the `output_config.format` path — the same [tool-schema-no-branded-
// transform] class the tools pin), it DERIVES from the same tool arg shapes (the shared-plane proof — a party
// entry parses exactly like `update_party` args), and an empty object is a valid "nothing changed" extraction.

import { rpgExtractionSchema, updatePartyArgsSchema } from "@orb/contracts/rpg";
import { z } from "zod";
import { expect, test } from "../../support/fixtures";

test("the extraction schema projects to JSON Schema without throwing (the output_config.format class)", () => {
  expect(() => z.toJSONSchema(rpgExtractionSchema)).not.toThrow();
});

test("an empty object is a valid 'nothing changed this turn' extraction (all fields default empty)", () => {
  const parsed = rpgExtractionSchema.parse({});
  expect(parsed).toEqual({ party: [], inventory: [], widgets: [], quests: [], journal: [] });
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
    journal: [{ type: "event", title: "Arrival", content: "They reached the city." }],
  });
  expect(parsed.party).toHaveLength(1);
  expect(parsed.inventory[0]?.walletDeltas).toEqual([{ name: "gold", delta: 25 }]);
  expect(parsed.quests[0]?.action).toBe("create");
  expect(parsed.journal[0]?.type).toBe("event");
});
