// @orb/contracts/rpg/extraction — the reliable-mode structured-output schema (rpg-design/05 §4.6). Pins: it
// PROJECTS to JSON Schema without throwing (the `output_config.format` path — the same [tool-schema-no-branded-
// transform] class the tools pin), it DERIVES from the same tool arg shapes (the shared-plane proof — a party
// entry parses exactly like `update_party` args), and an empty object is a valid "nothing changed" extraction.

import type { ExtractionRefs, RpgGameConfig } from "@orb/contracts/rpg";
import {
  composePlaneTeaching,
  constrainExtractionSchema,
  EXTRACTION_PLANE_PROMPTS,
  malformedToolCalls,
  RPG_NO_CHANGES_TOOL,
  RPG_TOOL_ROUND_TOOL_NAMES,
  rpgExtractionSchema,
  rpgGameConfigSchema,
  toolCallsToExtraction,
  updatePartyArgsSchema,
} from "@orb/contracts/rpg";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { z } from "zod";
import { expect, test } from "../../support/fixtures";

// The ref bundle's establishment flags. The enum tests below don't force scene population (both false); the
// establish-when-unset arm is pinned by its own tests further down.
const NO_ESTABLISH = { location: false, timeOfDay: false, presentCast: false } as const;

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

test("PLOT is MODEL-REACHABLE via scene.plot (P5) — present in the projected schema as the flat patch shape", () => {
  // Schema-string PRESENCE is the proof the reliable path can write the plane (the same lens that proves
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
  const constrained = constrainExtractionSchema(base, {
    actorRefs: ["You", "Bramwell"],
    widgetRefs: [],
    castFieldKeys: [],
    conditionNames: [],
    establishScene: NO_ESTABLISH,
  });
  expect(refEnum(constrained, ["properties", "party", "items", "properties", "targetRef", "enum"])).toEqual(["You", "Bramwell"]);
  expect(refEnum(constrained, ["properties", "inventory", "items", "properties", "targetRef", "enum"])).toEqual(["You", "Bramwell"]);
  expect(refEnum(constrained, ["properties", "scene", "properties", "presentRemove", "items", "enum"])).toEqual(["You", "Bramwell"]);
});

test("constrain injects the widgetRefs enum on widgets.widgetRef", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), {
    actorRefs: [],
    widgetRefs: ["Corruption", "Torch Fuel"],
    castFieldKeys: [],
    conditionNames: [],
    establishScene: NO_ESTABLISH,
  });
  expect(refEnum(constrained, ["properties", "widgets", "items", "properties", "widgetRef", "enum"])).toEqual(["Corruption", "Torch Fuel"]);
});

test("an EMPTY ref list leaves the field unconstrained (never an impossible empty enum — the fresh-game arm)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), {
    actorRefs: [],
    widgetRefs: [],
    castFieldKeys: [],
    conditionNames: [],
    establishScene: NO_ESTABLISH,
  });
  expect(refEnum(constrained, ["properties", "party", "items", "properties", "targetRef", "enum"])).toBeUndefined();
  expect(refEnum(constrained, ["properties", "widgets", "items", "properties", "widgetRef", "enum"])).toBeUndefined();
});

test("constrain does NOT mutate the input schema (the cached projection also feeds other wires)", () => {
  const base = projectJsonSchema(rpgExtractionSchema);
  const snapshot = JSON.stringify(base);
  constrainExtractionSchema(base, { actorRefs: ["You"], widgetRefs: ["W"], castFieldKeys: [], conditionNames: [], establishScene: NO_ESTABLISH });
  expect(JSON.stringify(base)).toBe(snapshot);
});

test("a constrained schema still PROJECTS clean (enum is plain JSON Schema every backend enforces)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), {
    actorRefs: ["You"],
    widgetRefs: [],
    castFieldKeys: [],
    conditionNames: [],
    establishScene: NO_ESTABLISH,
  });
  // The enum lives on a leaf string node — valid JSON Schema, no throw, portable to vLLM xgrammar + OR strict.
  expect(refEnum(constrained, ["properties", "party", "items", "properties", "targetRef", "type"])).toBe("string");
  expect(refEnum(constrained, ["properties", "party", "items", "properties", "targetRef", "enum"])).toEqual(["You"]);
});

test("constrain injects the castFieldKeys enum on scene.presentUpsert[].customFields[].name (§2.8)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), {
    actorRefs: [],
    widgetRefs: [],
    castFieldKeys: ["suspicion", "trust"],
    conditionNames: [],
    establishScene: NO_ESTABLISH,
  });
  const path = ["properties", "scene", "properties", "presentUpsert", "items", "properties", "customFields", "items", "properties", "name", "enum"];
  expect(refEnum(constrained, path)).toEqual(["suspicion", "trust"]);
});

test("an EMPTY castFieldKeys leaves the cast-field name unconstrained (the feature-off arm)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), {
    actorRefs: [],
    widgetRefs: [],
    castFieldKeys: [],
    conditionNames: [],
    establishScene: NO_ESTABLISH,
  });
  const path = ["properties", "scene", "properties", "presentUpsert", "items", "properties", "customFields", "items", "properties", "name", "enum"];
  expect(refEnum(constrained, path)).toBeUndefined();
});

// R5a — the LIST-IN-A-SCALAR fix. The ground-truth 8B run emitted `removeCondition: "Bleeding, Poisoned,
// Exhausted, Lamed"` (semantically right, structurally invalid — the hermes parser accepts it because it IS a
// valid string). Binding the field to the live active-condition enum makes that unrepresentable under xgrammar.
test("constrain injects the conditionNames enum on party[].removeCondition (R5a — a list-in-a-scalar is unrepresentable)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), {
    actorRefs: ["You"],
    widgetRefs: [],
    castFieldKeys: [],
    conditionNames: ["Bleeding", "Poisoned"],
    establishScene: NO_ESTABLISH,
  });
  const enumValues = refEnum(constrained, ["properties", "party", "items", "properties", "removeCondition", "enum"]);
  expect(enumValues).toEqual(["Bleeding", "Poisoned"]);
  // The comma-joined list the 8B emitted is NOT a member — the grammar can no longer produce it.
  expect(enumValues).not.toContain("Bleeding, Poisoned");
  // Still a plain leaf string node (portable JSON Schema — vLLM xgrammar + OR strict both enforce it).
  expect(refEnum(constrained, ["properties", "party", "items", "properties", "removeCondition", "type"])).toBe("string");
});

test("an EMPTY conditionNames leaves removeCondition unconstrained (nobody afflicted — never an empty enum)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), {
    actorRefs: ["You"],
    widgetRefs: [],
    castFieldKeys: [],
    conditionNames: [],
    establishScene: NO_ESTABLISH,
  });
  expect(refEnum(constrained, ["properties", "party", "items", "properties", "removeCondition", "enum"])).toBeUndefined();
});

test("establish-when-unset: an UNSET scene forces location/timeOfDay + a non-empty presentUpsert (the fresh-game arm)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), {
    actorRefs: [],
    widgetRefs: [],
    castFieldKeys: [],
    conditionNames: [],
    establishScene: { location: true, timeOfDay: true, presentCast: true },
  });
  // xgrammar/`strict` now FORCES the model to emit scene.location + scene.timeOfDay + at least one present character.
  expect(refEnum(constrained, ["required"])).toContain("scene");
  expect(refEnum(constrained, ["properties", "scene", "required"])).toEqual(expect.arrayContaining(["location", "timeOfDay", "presentUpsert"]));
  expect(refEnum(constrained, ["properties", "scene", "properties", "presentUpsert", "minItems"])).toBe(1);
});

test("establish-when-unset: an already-SET scene stays OPTIONAL (ongoing turn keeps omit=keep, no re-emit churn)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), {
    actorRefs: [],
    widgetRefs: [],
    castFieldKeys: [],
    conditionNames: [],
    establishScene: { location: false, timeOfDay: false, presentCast: false },
  });
  // Once the scene is established, nothing is forced — the model patches only what the beat moves.
  expect(refEnum(constrained, ["required"])).not.toContain("scene");
  expect(refEnum(constrained, ["properties", "scene", "properties", "presentUpsert", "minItems"])).toBeUndefined();
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

// ── EXTRACTION_PLANE_PROMPTS — the §1.6 per-plane prompt-fragment registry + its RATCHET ─────────────────
const NO_REFS: ExtractionRefs = { actorRefs: [], widgetRefs: [], castFieldKeys: [], conditionNames: [], establishScene: NO_ESTABLISH };
const baseConfig = (): RpgGameConfig => rpgGameConfigSchema.parse({});

test("RATCHET (§1.6): every top-level rpgExtractionSchema key has a registry row (a new writable plane needs a fragment)", () => {
  // The D50 bus-coverage ratchet discipline applied to prompt teaching: a plane that is schema-writable but has
  // no registry row would be prompt-SILENT (the exact plane-under-service class the redesign killed). This RED
  // is the enforcer — add the plane's fragment when this fails, never suppress.
  const schemaKeys = Object.keys(rpgExtractionSchema.shape).sort();
  const registryPlanes = EXTRACTION_PLANE_PROMPTS.map((r) => r.plane).sort();
  expect(registryPlanes).toEqual(schemaKeys);
});

test("§1.6: the composed teaching prompts the newly-covered planes (plot gate ON, emoji, reconcile, inventory-infer)", () => {
  const teaching = composePlaneTeaching({ config: baseConfig(), refs: NO_REFS });
  expect(teaching).toContain("scene.plot"); // plotProgression defaults ON → the plot clause composes
  expect(teaching).toContain("emoji"); // the portrait-fallback emoji clause
  expect(teaching).toContain("RECONCILE"); // the anti-drift doctrine
  expect(teaching).toContain("INFER"); // the owner's inventory-inference ask
});

test("§1.6: the plot clause is GATED — plotProgression OFF drops it (applicability, no dead prompt)", () => {
  const off = rpgGameConfigSchema.parse({ features: { plotProgression: false } });
  expect(composePlaneTeaching({ config: off, refs: NO_REFS })).not.toContain("scene.plot");
});

test("§1.6: the widgets fragment is null with no widget refs (feature-off arm) and enumerates live labels when present", () => {
  // A game with no custom widgets: the widgets plane teaches NOTHING (a fragment returning null is dropped).
  expect(composePlaneTeaching({ config: baseConfig(), refs: NO_REFS })).not.toContain("CUSTOM TRACKERS");
  // With live widget refs, the fragment enumerates them (the reliable-arm gap §1.6 closed).
  const withWidgets = composePlaneTeaching({ config: baseConfig(), refs: { ...NO_REFS, widgetRefs: ["Corruption", "Torch Fuel"] } });
  expect(withWidgets).toContain("CUSTOM TRACKERS");
  expect(withWidgets).toContain("Corruption");
});

test("§1.6: the cast-fields fragment enumerates host-defined fields with their hints (customFields gap)", () => {
  const config = rpgGameConfigSchema.parse({
    features: { castFields: [{ key: "corruption", label: "Corruption", kind: "meter", max: 100, hint: "rises with dark choices" }] },
  });
  const teaching = composePlaneTeaching({ config, refs: NO_REFS });
  expect(teaching).toContain("Corruption");
  expect(teaching).toContain("0-100");
  expect(teaching).toContain("rises with dark choices");
});

test("§1.6: the structured dateMode prompts the day counter; narrated does NOT (mode-aware fragment)", () => {
  const structured = rpgGameConfigSchema.parse({ dateMode: "structured" });
  expect(composePlaneTeaching({ config: structured, refs: NO_REFS })).toContain("scene.day");
  // The default (narrated) mode teaches calendarDate, never the integer day counter.
  expect(composePlaneTeaching({ config: baseConfig(), refs: NO_REFS })).not.toContain("scene.day");
});

test("§1.6 #7 (recommendation A): a deception-active game prefixes the surface-only clause; a plain game does NOT", () => {
  const deceptive = rpgGameConfigSchema.parse({ features: { deception: true } });
  const clause = composePlaneTeaching({ config: deceptive, refs: NO_REFS });
  expect(clause).toContain("Record only the players' SURFACE reality");
  expect(clause).toContain("Do NOT write a character's secret truth");
  // A non-deception game is byte-free of the clause (the clause is deception-gated).
  expect(composePlaneTeaching({ config: baseConfig(), refs: NO_REFS })).not.toContain("SURFACE reality");
});

// ── malformedToolCalls (R1 — the DROP predicate the fold's observability reads) ─────────────────────────
// It must mirror `toolCallsToExtraction`'s silent drops EXACTLY: same input, and whatever the fold threw away
// is what this names. A drift between the two would make a folded turn's log lie about what it lost.

test("R1: names the calls the fold DROPS — non-JSON args and schema-invalid args alike", () => {
  const calls = [
    { name: "update_party", arguments: "{not json" },
    { name: "update_scene", arguments: JSON.stringify({ presentUpsert: "should be an array" }) },
    { name: "update_party", arguments: JSON.stringify({ targetRef: "player", hpDelta: -3 }) },
  ];
  expect([...malformedToolCalls(calls)]).toEqual(["update_party", "update_scene"]);
  // …and the fold kept exactly the one good call (the two predicates agree by construction).
  const ex = toolCallsToExtraction(calls);
  expect(ex.party).toHaveLength(1);
  expect(ex.scene).toBeUndefined();
});

test("R1: `no_changes` and unknown tool names are NOT malformed — they are legitimate no-ops", () => {
  expect(malformedToolCalls([{ name: RPG_NO_CHANGES_TOOL, arguments: "{}" }])).toEqual([]);
  expect(malformedToolCalls([{ name: "some_other_tool", arguments: "not json at all" }])).toEqual([]);
});

test("R1: an all-good round reports nothing dropped (a quiet log on the happy path)", () => {
  expect(
    malformedToolCalls([
      { name: "update_scene", arguments: JSON.stringify({ location: "the ford" }) },
      { name: "add_journal_entry", arguments: JSON.stringify({ type: "event", title: "t", content: "c" }) },
    ]),
  ).toEqual([]);
});
