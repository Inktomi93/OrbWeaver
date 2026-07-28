// @orb/contracts/rpg/extraction — the reliable-mode structured-output schema (rpg-design/05 §4.6). Pins: it
// PROJECTS to JSON Schema without throwing (the `output_config.format` path — the same [tool-schema-no-branded-
// transform] class the tools pin), it DERIVES from the same tool arg shapes (the shared-plane proof — a party
// entry parses exactly like `update_party` args), and an empty object is a valid "nothing changed" extraction.

import {
  constrainExtractionSchema,
  RPG_NO_CHANGES_TOOL,
  RPG_TOOL_ROUND_TOOL_NAMES,
  rpgExtractionSchema,
  toolCallsToExtraction,
  updatePartyArgsSchema,
} from "@orb/contracts/rpg";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { z } from "zod";
import { expect, test } from "../../support/fixtures";

test("the extraction schema projects to JSON Schema without throwing (the output_config.format class)", () => {
  expect(() => z.toJSONSchema(rpgExtractionSchema)).not.toThrow();
});

test("an empty object is a valid 'nothing changed this turn' extraction (all fields default empty)", () => {
  const parsed = rpgExtractionSchema.parse({});
  expect(parsed).toEqual({ party: [], inventory: [], widgets: [], quests: [], journal: [] });
});

test("LEVEL is UNREACHABLE from the model (§2.6 hand-only) — absent from the projected extraction schema AND tool args", () => {
  // The whole projected schema serialized — `level` must not appear as a writable property anywhere (the
  // extraction reaches every model-writable plane, so its absence proves level is model-unwritable). A `level`
  // reachable through a tool arg or the extraction would be the progression-inflation footgun §2.6 forbids.
  const schemaJson = JSON.stringify(projectJsonSchema(rpgExtractionSchema));
  expect(schemaJson).not.toContain("level");
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

// ── constrainExtractionSchema (R1 — the per-call ref constraint that kills the mis-target class) ────────
function refEnum(schema: Record<string, unknown>, path: readonly string[]): unknown {
  let node: unknown = schema;
  for (const key of path) {
    node = node !== null && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined;
  }
  return node;
}

test("constrain injects the actorRefs enum on party/inventory targetRef + scene.presentRemove", () => {
  const base = projectJsonSchema(rpgExtractionSchema);
  const constrained = constrainExtractionSchema(base, { actorRefs: ["You", "Bramwell"], widgetRefs: [], castFieldKeys: [] });
  expect(refEnum(constrained, ["properties", "party", "items", "properties", "targetRef", "enum"])).toEqual(["You", "Bramwell"]);
  expect(refEnum(constrained, ["properties", "inventory", "items", "properties", "targetRef", "enum"])).toEqual(["You", "Bramwell"]);
  expect(refEnum(constrained, ["properties", "scene", "properties", "presentRemove", "items", "enum"])).toEqual(["You", "Bramwell"]);
});

test("constrain injects the widgetRefs enum on widgets.widgetRef", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), {
    actorRefs: [],
    widgetRefs: ["Corruption", "Torch Fuel"],
    castFieldKeys: [],
  });
  expect(refEnum(constrained, ["properties", "widgets", "items", "properties", "widgetRef", "enum"])).toEqual(["Corruption", "Torch Fuel"]);
});

test("an EMPTY ref list leaves the field unconstrained (never an impossible empty enum — the fresh-game arm)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), { actorRefs: [], widgetRefs: [], castFieldKeys: [] });
  expect(refEnum(constrained, ["properties", "party", "items", "properties", "targetRef", "enum"])).toBeUndefined();
  expect(refEnum(constrained, ["properties", "widgets", "items", "properties", "widgetRef", "enum"])).toBeUndefined();
});

test("constrain does NOT mutate the input schema (the cached projection also feeds other wires)", () => {
  const base = projectJsonSchema(rpgExtractionSchema);
  const snapshot = JSON.stringify(base);
  constrainExtractionSchema(base, { actorRefs: ["You"], widgetRefs: ["W"], castFieldKeys: [] });
  expect(JSON.stringify(base)).toBe(snapshot);
});

test("a constrained schema still PROJECTS clean (enum is plain JSON Schema every backend enforces)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), { actorRefs: ["You"], widgetRefs: [], castFieldKeys: [] });
  // The enum lives on a leaf string node — valid JSON Schema, no throw, portable to vLLM xgrammar + OR strict.
  expect(refEnum(constrained, ["properties", "party", "items", "properties", "targetRef", "type"])).toBe("string");
  expect(refEnum(constrained, ["properties", "party", "items", "properties", "targetRef", "enum"])).toEqual(["You"]);
});

test("constrain injects the castFieldKeys enum on scene.presentUpsert[].customFields[].name (§2.8)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), {
    actorRefs: [],
    widgetRefs: [],
    castFieldKeys: ["suspicion", "trust"],
  });
  const path = ["properties", "scene", "properties", "presentUpsert", "items", "properties", "customFields", "items", "properties", "name", "enum"];
  expect(refEnum(constrained, path)).toEqual(["suspicion", "trust"]);
});

test("an EMPTY castFieldKeys leaves the cast-field name unconstrained (the feature-off arm)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), { actorRefs: [], widgetRefs: [], castFieldKeys: [] });
  const path = ["properties", "scene", "properties", "presentUpsert", "items", "properties", "customFields", "items", "properties", "name", "enum"];
  expect(refEnum(constrained, path)).toBeUndefined();
});

// ── toolCallsToExtraction (the cheap TOOL ROUND fold — parallel tool calls → an RpgExtraction) ──────────

test("RPG_TOOL_ROUND_TOOL_NAMES = the 6 state tools + no_changes (roll_dice excluded — zero state)", () => {
  expect([...RPG_TOOL_ROUND_TOOL_NAMES]).toEqual([
    "update_party",
    "update_inventory",
    "update_scene",
    "set_widget_value",
    "upsert_quest",
    "add_journal_entry",
    RPG_NO_CHANGES_TOOL,
  ]);
  expect(RPG_TOOL_ROUND_TOOL_NAMES).not.toContain("roll_dice");
});

test("folds PARALLEL calls into one extraction (same-plane calls accumulate, scene is last-wins)", () => {
  const ex = toolCallsToExtraction([
    { name: "update_party", arguments: JSON.stringify({ targetRef: "player", status: "wounded" }) },
    { name: "update_party", arguments: JSON.stringify({ targetRef: "Kael", hpDelta: -3 }) },
    { name: "update_scene", arguments: JSON.stringify({ location: "the bridge" }) },
    { name: "add_journal_entry", arguments: JSON.stringify({ type: "event", title: "Fight", content: "A brawl." }) },
  ]);
  expect(ex.party).toHaveLength(2); // both update_party calls accumulate
  expect(ex.party.map((p) => p.targetRef)).toEqual(["player", "Kael"]);
  expect(ex.scene?.location).toBe("the bridge");
  expect(ex.journal).toHaveLength(1);
});

test("no_changes (and any unknown tool) contributes nothing — the quiet-turn no-op", () => {
  const ex = toolCallsToExtraction([{ name: RPG_NO_CHANGES_TOOL, arguments: "{}" }]);
  expect(ex.party).toEqual([]);
  expect(ex.inventory).toEqual([]);
  expect(ex.scene).toBeUndefined();
  expect(ex.widgets).toEqual([]);
  expect(ex.quests).toEqual([]);
  expect(ex.journal).toEqual([]);
});

test("a malformed args string is DROPPED (errors-as-data — never a throw into the flush)", () => {
  const ex = toolCallsToExtraction([
    { name: "update_party", arguments: "not json{" },
    { name: "update_party", arguments: JSON.stringify({ targetRef: "player" }) },
  ]);
  expect(ex.party).toHaveLength(1); // only the valid call survives
  expect(ex.party[0]?.targetRef).toBe("player");
});

test("a schema-INVALID call is dropped (a tool call missing its required arg never writes)", () => {
  const ex = toolCallsToExtraction([
    { name: "add_journal_entry", arguments: JSON.stringify({ title: "no type or content" }) }, // missing required fields
    { name: "update_scene", arguments: JSON.stringify({ location: "valid" }) },
  ]);
  expect(ex.journal).toEqual([]); // the invalid journal call dropped
  expect(ex.scene?.location).toBe("valid");
});
