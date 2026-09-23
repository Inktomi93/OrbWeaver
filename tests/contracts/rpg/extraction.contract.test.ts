// @orb/contracts/rpg/extraction — the structured-output extraction schema (rpg-design/05 §4.6). Pins: it
// PROJECTS to JSON Schema without throwing (the `output_config.format` path — the same [tool-schema-no-branded-
// transform] class the tools pin), it DERIVES from the same tool arg shapes (the shared-plane proof — a party
// entry parses exactly like `update_party` args), and an empty object is a valid "nothing changed" extraction.

import { scrubWireSchema } from "@orb/contracts/inference";
import type { ExtractionRefs, RpgGameConfig, RpgTrackerCarrier, RpgTrackerDef } from "@orb/contracts/rpg";
import {
  actorTrackerWriteKeys,
  buildRpgToolDescriptions,
  buildTrackerWriteGroups,
  cacheStableExtractionRefs,
  composePlaneTeaching,
  composePopulateTeaching,
  constrainExtractionSchema,
  constrainPopulateSchema,
  EXTRACTION_PLANE_PROMPTS,
  gameTrackerWriteKeys,
  healedJournalTypes,
  malformedToolCallDetails,
  malformedToolCalls,
  RPG_BASELINE_TOOL_DESCRIPTIONS,
  RPG_NO_CHANGES_TOOL,
  RPG_TOOL_ROUND_TOOL_NAMES,
  RPG_WEATHER_TYPES,
  recordToolCalls,
  rpgExtractionSchema,
  rpgGameConfigSchema,
  rpgPopulateSchema,
  rpgTrackerDefSchema,
  salvagedToolCallFields,
  salvageExtraction,
  salvagePopulate,
  strippedToolCallKeys,
  toolCallsToExtraction,
  updatePartyArgsSchema,
  updateSceneArgsSchema,
} from "@orb/contracts/rpg";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { z } from "zod";
import { expect, test } from "../../support/fixtures.ts";

// The ref bundle's establishment flags. The enum tests below don't force scene population (both false); the
// establish-when-unset arm is pinned by its own tests further down.
const NO_ESTABLISH = { location: false, timeOfDay: false, presentCast: false } as const;

/** The tracker-free ref bundle every non-R6 enum test starts from (a game that tracks nothing per-actor). */
const BARE_REFS: ExtractionRefs = {
  actorRefs: [],
  trackerWriteGroups: [],
  gameTrackerKeys: { deltaKeys: [], setKeys: [] },
  conditionNames: [],
  establishScene: NO_ESTABLISH,
};

/** A tracker def with the axes a test cares about; everything else takes its schema default. */
function tracker(over: Partial<RpgTrackerDef> & Pick<RpgTrackerDef, "key" | "label" | "shape" | "write" | "subject">): RpgTrackerDef {
  return rpgTrackerDefSchema.parse(over);
}

/** A carrier (an actor the write surface may target), with no sheet exceptions unless given. */
function carrier(name: string, kind: "party" | "npcs", over: Partial<RpgTrackerCarrier> = {}): RpgTrackerCarrier {
  return { actorKey: `${kind === "npcs" ? "npc" : "user"}:${name}`, name, kind, grants: [], revokes: [], ...over };
}

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
  const constrained = constrainExtractionSchema(base, { ...BARE_REFS, actorRefs: ["You", "Bramwell"] });
  expect(refEnum(constrained, ["properties", "party", "items", "properties", "targetRef", "enum"])).toEqual(["You", "Bramwell"]);
  expect(refEnum(constrained, ["properties", "inventory", "items", "properties", "targetRef", "enum"])).toEqual(["You", "Bramwell"]);
  expect(refEnum(constrained, ["properties", "scene", "properties", "presentRemove", "items", "enum"])).toEqual(["You", "Bramwell"]);
});

test("R6: the GAME-subject trackers plane binds its key enum and prunes the arm no live tracker needs", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), {
    ...BARE_REFS,
    gameTrackerKeys: { deltaKeys: [], setKeys: ["alarm", "torch_fuel"] },
  });
  const item = ["properties", "trackers", "items"] as const;
  expect(refEnum(constrained, [...item, "properties", "key", "enum"])).toEqual(["alarm", "torch_fuel"]);
  // Both game trackers are `write:"set"`, so the `delta` arm is REMOVED — not offered as a dead field.
  expect(refEnum(constrained, [...item, "properties", "delta"])).toBeUndefined();
  expect(refEnum(constrained, [...item, "properties", "value"])).toBeDefined();
});

test("R6: a game with NO game-subject trackers loses the whole plane (a disabled feature's tool is omitted)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), BARE_REFS);
  expect(refEnum(constrained, ["properties", "trackers"])).toBeUndefined();
  // ...and it leaves `required` with it, so the grammar never demands a plane that no longer exists.
  expect(refEnum(constrained, ["required"])).not.toContain("trackers");
});

test("an EMPTY ref list leaves the field unconstrained (never an impossible empty enum — the fresh-game arm)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), BARE_REFS);
  expect(refEnum(constrained, ["properties", "party", "items", "properties", "targetRef", "enum"])).toBeUndefined();
});

test("constrain does NOT mutate the input schema (the cached projection also feeds other wires)", () => {
  const base = projectJsonSchema(rpgExtractionSchema);
  const snapshot = JSON.stringify(base);
  constrainExtractionSchema(base, { ...BARE_REFS, actorRefs: ["You"], gameTrackerKeys: { deltaKeys: [], setKeys: ["alarm"] } });
  expect(JSON.stringify(base)).toBe(snapshot);
});

test("a constrained schema still PROJECTS clean (enum is plain JSON Schema every backend enforces)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), { ...BARE_REFS, actorRefs: ["You"] });
  // The enum lives on a leaf string node — valid JSON Schema, no throw, portable to vLLM xgrammar + OR strict.
  expect(refEnum(constrained, ["properties", "party", "items", "properties", "targetRef", "type"])).toBe("string");
  expect(refEnum(constrained, ["properties", "party", "items", "properties", "targetRef", "enum"])).toEqual(["You"]);
});

// ── R6: the PER-ACTOR write surface (the tracked-field unification's strongest prevent-at-schema) ──────
// "The reminder is the model's knowledge; the tools are its permissions." A target actor is offered ONLY the
// trackers it actually carries, minus the locked ones — so the schema can never hand the model Mana on an
// actor with no Mana, and the apply-time strip is a backstop rather than the gate.

const MANA = tracker({ key: "mana", label: "Mana", shape: "meter", write: "delta", subject: "actor", appliesTo: "party" });
const TRUST = tracker({ key: "trust", label: "Trust", shape: "text", write: "set", subject: "actor", appliesTo: "npcs" });
const SEALED = tracker({ key: "sealed", label: "Sealed", shape: "meter", write: "delta", subject: "actor", appliesTo: "everyone", locked: true });

test("R6: ONE carrier set keeps the party schema FLAT (the common game pays nothing for the machinery)", () => {
  const groups = buildTrackerWriteGroups([MANA], [carrier("Kael", "party"), carrier("Sera", "party")]);
  expect(groups).toHaveLength(1);
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), {
    ...BARE_REFS,
    actorRefs: ["Kael", "Sera"],
    trackerWriteGroups: groups,
  });
  const item = ["properties", "party", "items"] as const;
  expect(refEnum(constrained, [...item, "oneOf"])).toBeUndefined();
  expect(refEnum(constrained, [...item, "properties", "targetRef", "enum"])).toEqual(["Kael", "Sera"]);
  expect(refEnum(constrained, [...item, "properties", "trackerDeltas", "items", "properties", "key", "enum"])).toEqual(["mana"]);
  // Nobody carries a `set` tracker here, so that arm is REMOVED (never an empty-enum husk).
  expect(refEnum(constrained, [...item, "properties", "trackerSets"])).toBeUndefined();
});

test("R6: an actor who does NOT carry a tracker is never offered it (the whole point — a oneOf branch each)", () => {
  // Kael carries Mana (party class); Mira is an NPC carrying Trust; Sera had Mana REVOKED on her sheet.
  const groups = buildTrackerWriteGroups([MANA, TRUST], [carrier("Kael", "party"), carrier("Sera", "party", { revokes: ["mana"] }), carrier("Mira", "npcs")]);
  expect(groups).toHaveLength(3);
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), {
    ...BARE_REFS,
    actorRefs: ["Kael", "Sera", "Mira"],
    trackerWriteGroups: groups,
  });
  const branches = refEnum(constrained, ["properties", "party", "items", "oneOf"]) as Record<string, unknown>[];
  expect(branches).toHaveLength(3);
  const byTarget = new Map(
    branches.map((b) => {
      const props = b["properties"] as Record<string, Record<string, unknown>>;
      const target = ((props["targetRef"]?.["enum"] ?? []) as string[])[0] ?? "";
      return [target, props] as const;
    }),
  );
  /** The key enum a branch's write arm offers ("what may this actor's writes name?"). */
  const armKeys = (target: string, arm: string): unknown => refEnum(byTarget.get(target) ?? {}, [arm, "items", "properties", "key", "enum"]);
  // Kael: Mana on the delta arm, no set arm at all.
  expect(armKeys("Kael", "trackerDeltas")).toEqual(["mana"]);
  expect(byTarget.get("Kael")?.["trackerSets"]).toBeUndefined();
  // Sera: Mana revoked ⇒ NO tracker arms whatsoever (she is still targetable for conditions/status).
  expect(byTarget.get("Sera")?.["trackerDeltas"]).toBeUndefined();
  expect(byTarget.get("Sera")?.["trackerSets"]).toBeUndefined();
  expect(byTarget.get("Sera")?.["addCondition"]).toBeDefined();
  // Mira: the NPC-class Trust on the SET arm, and no delta arm.
  expect(armKeys("Mira", "trackerSets")).toEqual(["trust"]);
  expect(byTarget.get("Mira")?.["trackerDeltas"]).toBeUndefined();
});

test("R6: a LOCKED tracker is ABSENT from the write schema (prevent-at-schema, not strip-at-apply)", () => {
  const groups = buildTrackerWriteGroups([MANA, SEALED], [carrier("Kael", "party")]);
  expect(groups[0]?.deltaKeys).toEqual(["mana"]);
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), {
    ...BARE_REFS,
    actorRefs: ["Kael"],
    trackerWriteGroups: groups,
  });
  const keys = refEnum(constrained, ["properties", "party", "items", "properties", "trackerDeltas", "items", "properties", "key", "enum"]);
  expect(keys).toEqual(["mana"]);
  expect(keys).not.toContain("sealed");
  // The whole projected schema string never names it — the model cannot spend attention on a write it can't make.
  expect(JSON.stringify(constrained)).not.toContain("sealed");
});

test("R6: a GRANT reaches an actor the class missed; a REVOKE beats everything", () => {
  const bound = tracker({ key: "bound_will", label: "Bound Will", shape: "meter", write: "delta", subject: "actor", appliesTo: "npcs" });
  const groups = buildTrackerWriteGroups(
    [MANA, bound],
    [carrier("Kael", "party", { grants: ["bound_will"] }), carrier("Sera", "party", { revokes: ["mana"] })],
  );
  // Ordered by the ONE tracker ordering (sort, then key) — stable across calls, so the per-call schema
  // never reshuffles for nothing (a prompt-cache + xgrammar-compile miss).
  expect(groups.find((g) => g.targetRefs.includes("Kael"))?.deltaKeys).toEqual(["bound_will", "mana"]);
  expect(groups.find((g) => g.targetRefs.includes("Sera"))?.deltaKeys).toEqual([]);
});

test("R6: the game-subject write keys split by the write axis and drop the locked ones", () => {
  const alarm = tracker({ key: "alarm", label: "Alarm", shape: "meter", write: "set", subject: "game" });
  const fuel = tracker({ key: "fuel", label: "Fuel", shape: "meter", write: "delta", subject: "game" });
  const hidden = tracker({ key: "hidden", label: "Hidden", shape: "meter", write: "set", subject: "game", locked: true });
  expect(gameTrackerWriteKeys([alarm, fuel, hidden, MANA])).toEqual({ deltaKeys: ["fuel"], setKeys: ["alarm"] });
});

// R5a — the LIST-IN-A-SCALAR fix. The ground-truth 8B run emitted `removeCondition: "Bleeding, Poisoned,
// Exhausted, Lamed"` (semantically right, structurally invalid — the hermes parser accepts it because it IS a
// valid string). Binding the field to the live active-condition enum makes that unrepresentable under xgrammar.
test("constrain injects the conditionNames enum on party[].removeCondition (R5a — a list-in-a-scalar is unrepresentable)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), {
    ...BARE_REFS,
    actorRefs: ["You"],
    conditionNames: ["Bleeding", "Poisoned"],
  });
  const enumValues = refEnum(constrained, ["properties", "party", "items", "properties", "removeCondition", "enum"]);
  expect(enumValues).toEqual(["Bleeding", "Poisoned"]);
  // The comma-joined list the 8B emitted is NOT a member — the grammar can no longer produce it.
  expect(enumValues).not.toContain("Bleeding, Poisoned");
  // Still a plain leaf string node (portable JSON Schema — vLLM xgrammar + OR strict both enforce it).
  expect(refEnum(constrained, ["properties", "party", "items", "properties", "removeCondition", "type"])).toBe("string");
});

test("an EMPTY conditionNames leaves removeCondition unconstrained (nobody afflicted — never an empty enum)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), { ...BARE_REFS, actorRefs: ["You"] });
  expect(refEnum(constrained, ["properties", "party", "items", "properties", "removeCondition", "enum"])).toBeUndefined();
});

test("establish-when-unset: an UNSET scene forces location/timeOfDay + a non-empty presentUpsert (the fresh-game arm)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), {
    ...BARE_REFS,
    establishScene: { location: true, timeOfDay: true, presentCast: true },
  });
  // xgrammar/`strict` now FORCES the model to emit scene.location + scene.timeOfDay + at least one present character.
  expect(refEnum(constrained, ["required"])).toContain("scene");
  expect(refEnum(constrained, ["properties", "scene", "required"])).toEqual(expect.arrayContaining(["location", "timeOfDay", "presentUpsert"]));
  expect(refEnum(constrained, ["properties", "scene", "properties", "presentUpsert", "minItems"])).toBe(1);
});

test("establish-when-unset: an already-SET scene stays OPTIONAL (ongoing turn keeps omit=keep, no re-emit churn)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), BARE_REFS);
  // Once the scene is established, nothing is forced — the model patches only what the beat moves.
  expect(refEnum(constrained, ["required"])).not.toContain("scene");
  expect(refEnum(constrained, ["properties", "scene", "properties", "presentUpsert", "minItems"])).toBeUndefined();
});

// ── cacheStableExtractionRefs (F4 — the folded turn's tool payload is prompt-cache-key bytes) ───────────
// the probe's sibling ./RESULTS.md F4 measured that ANY byte change in the `tools` payload drops `cached_tokens` to zero and re-bills
// the WHOLE prefix. The folded vehicle mounts these tools on the character turn, so the schema they carry must
// not move when the SCENE moves — while every config-derived constraint must survive intact.

const STABLE_DEFS = [MANA, TRUST, SEALED];

/** The projected+constrained schema for one live ref bundle, through the cache-stable projection. */
function stableSchema(refs: ExtractionRefs): Record<string, unknown> {
  return constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), cacheStableExtractionRefs(refs, STABLE_DEFS));
}

test("PROMPT-CACHE (probe F4): gaining an actor AND a condition leaves the folded tool payload BYTE-IDENTICAL (the cache-key property)", () => {
  const before: ExtractionRefs = {
    ...BARE_REFS,
    actorRefs: ["Kael"],
    trackerWriteGroups: buildTrackerWriteGroups(STABLE_DEFS, [carrier("Kael", "party")]),
  };
  // One beat later: an NPC walked on stage (a second carrier ⇒ a SECOND write group under the live bundle) and
  // somebody picked up a condition — the exact churn that was re-billing the whole story prefix.
  const after: ExtractionRefs = {
    ...before,
    actorRefs: ["Kael", "Mira"],
    trackerWriteGroups: buildTrackerWriteGroups(STABLE_DEFS, [carrier("Kael", "party"), carrier("Mira", "npcs")]),
    conditionNames: ["Bleeding"],
  };
  // The LIVE bundles genuinely differ (this test would be vacuous if the two schemas were equal anyway).
  expect(JSON.stringify(constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), before))).not.toEqual(
    JSON.stringify(constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), after)),
  );
  expect(JSON.stringify(stableSchema(after))).toEqual(JSON.stringify(stableSchema(before)));
});

test("PROMPT-CACHE (probe F4): the stable projection KEEPS the config-derived enforcement (tracker keys, locked prevention, establish)", () => {
  const constrained = stableSchema({
    ...BARE_REFS,
    actorRefs: ["Kael"],
    trackerWriteGroups: buildTrackerWriteGroups(STABLE_DEFS, [carrier("Kael", "party")]),
    gameTrackerKeys: { deltaKeys: [], setKeys: ["alarm"] },
    establishScene: { location: true, timeOfDay: true, presentCast: true },
  });
  const item = ["properties", "party", "items"] as const;
  // Both write arms survive (an empty group list would have PRUNED them — losing the write surface itself), and
  // each key enum is the GAME's own unlocked actor trackers, not the live carrier split.
  expect(refEnum(constrained, [...item, "properties", "trackerDeltas", "items", "properties", "key", "enum"])).toEqual(["mana"]);
  expect(refEnum(constrained, [...item, "properties", "trackerSets", "items", "properties", "key", "enum"])).toEqual(["trust"]);
  // The LOCKED tracker stays unrepresentable — prevent-at-schema is not what got traded away.
  expect(JSON.stringify(constrained)).not.toContain("sealed");
  // Game-subject keys + establish-when-unset ride on untouched.
  expect(refEnum(constrained, ["properties", "trackers", "items", "properties", "key", "enum"])).toEqual(["alarm"]);
  expect(refEnum(constrained, ["properties", "scene", "required"])).toEqual(expect.arrayContaining(["location", "timeOfDay", "presentUpsert"]));
});

test("PROMPT-CACHE (probe F4): only the SCENE-derived enums are dropped (targetRef/presentRemove/removeCondition go unconstrained)", () => {
  const constrained = stableSchema({ ...BARE_REFS, actorRefs: ["Kael", "Mira"], conditionNames: ["Bleeding"] });
  expect(refEnum(constrained, ["properties", "party", "items", "properties", "targetRef", "enum"])).toBeUndefined();
  expect(refEnum(constrained, ["properties", "party", "items", "properties", "removeCondition", "enum"])).toBeUndefined();
  expect(refEnum(constrained, ["properties", "inventory", "items", "properties", "targetRef", "enum"])).toBeUndefined();
  expect(refEnum(constrained, ["properties", "scene", "properties", "presentRemove", "items", "enum"])).toBeUndefined();
  // …and the fields themselves are still WRITABLE (dropped constraint, never a dropped plane).
  expect(refEnum(constrained, ["properties", "party", "items", "properties", "targetRef", "type"])).toBe("string");
});

test("PROMPT-CACHE (probe F4): a game with NO actor trackers keeps a targetable party plane (both arms pruned, condition/status intact)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), cacheStableExtractionRefs({ ...BARE_REFS, actorRefs: ["Kael"] }, []));
  const props = refEnum(constrained, ["properties", "party", "items", "properties"]) as Record<string, unknown>;
  expect(props["trackerDeltas"]).toBeUndefined();
  expect(props["trackerSets"]).toBeUndefined();
  // The non-tracker planes survive the prune — a tracker-free game can still afflict and describe an actor.
  // (`hpDelta` is NOT among them since R3: health is a tracker, so a game with no trackers has no health.)
  expect(props["hpDelta"]).toBeUndefined();
  expect(props["addCondition"]).toBeDefined();
  expect(props["status"]).toBeDefined();
});

test("PROMPT-CACHE (probe F4): actorTrackerWriteKeys is the config-only superset — unlocked actor trackers, split by write axis", () => {
  expect(actorTrackerWriteKeys(STABLE_DEFS)).toEqual({ deltaKeys: ["mana"], setKeys: ["trust"] });
  // Game-subject trackers belong to the OTHER surface and never leak in.
  expect(actorTrackerWriteKeys([tracker({ key: "alarm", label: "Alarm", shape: "meter", write: "set", subject: "game" })])).toEqual({
    deltaKeys: [],
    setKeys: [],
  });
});

// ── toolCallsToExtraction (the cheap TOOL ROUND fold — parallel tool calls → an RpgExtraction) ──────────

test("RPG_TOOL_ROUND_TOOL_NAMES = the 6 state tools + no_changes (roll_dice excluded — zero state)", () => {
  expect([...RPG_TOOL_ROUND_TOOL_NAMES]).toEqual([
    "update_party",
    "update_inventory",
    "update_scene",
    "set_tracker",
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
    { name: "add_journal_entry", arguments: JSON.stringify({ type: "event", label: "", title: "Fight", content: "A brawl." }) },
  ]);
  expect(ex.party).toHaveLength(2); // both update_party calls accumulate
  expect(ex.party.map((p) => p.targetRef)).toEqual(["player", "Kael"]);
  expect(ex.scene?.location).toBe("the bridge");
  expect(ex.journal).toHaveLength(1);
});

test("the mapped array-arm registry routes every tool through the identical structured-extraction plane", () => {
  const party = { targetRef: "You", status: "ready" };
  const inventory = { targetRef: "You", add: [{ name: "Bone Key" }] };
  const trackerWrite = { key: "momentum", delta: 1 };
  const quest = { name: "Open the Gate", action: "create" as const };
  const journal = { type: "event" as const, content: "The gate opened." };
  const viaCalls = toolCallsToExtraction([
    { name: "update_party", arguments: JSON.stringify(party) },
    { name: "update_inventory", arguments: JSON.stringify(inventory) },
    { name: "set_tracker", arguments: JSON.stringify(trackerWrite) },
    { name: "upsert_quest", arguments: JSON.stringify(quest) },
    { name: "add_journal_entry", arguments: JSON.stringify(journal) },
  ]);
  const viaStructured = salvageExtraction({ party: [party], inventory: [inventory], trackers: [trackerWrite], quests: [quest], journal: [journal] });

  expect(viaStructured.dropped).toEqual([]);
  expect(viaStructured.extraction).toEqual(viaCalls);
});

test("no_changes (and any unknown tool) contributes nothing — the quiet-turn no-op", () => {
  const ex = toolCallsToExtraction([{ name: RPG_NO_CHANGES_TOOL, arguments: "{}" }]);
  expect(ex.party).toEqual([]);
  expect(ex.inventory).toEqual([]);
  expect(ex.scene).toBeUndefined();
  expect(ex.trackers).toEqual([]);
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

// ── salvageExtraction (EXT-4a — the RELIABLE arm's per-plane / per-entry parse) ───────────────────────────
// The defect: one whole-object `safeParse` meant ONE malformed nested field discarded all six planes, while the
// tool vehicles (validating per call) lost only the bad call. These pin the drop GRANULARITY; the three-path
// equality itself is pinned composed-real in `tests/server/entry/compose/rpg.int.test.ts`.

test("EXT-4a: a malformed journal ENTRY drops that entry ALONE — every other plane still applies", () => {
  const { extraction, dropped } = salvageExtraction({
    party: [{ targetRef: "player", status: "wounded" }],
    scene: { location: "the ford" },
    quests: [{ name: "Cross the river", action: "create" }],
    // Entry 0 is content-less (malformed — nothing to log); entry 1 is a perfectly good beat.
    journal: [
      { type: "note", title: "no body" },
      { type: "event", content: "They forded the river." },
    ],
  });
  expect(extraction.party).toHaveLength(1);
  expect(extraction.scene?.location).toBe("the ford");
  expect(extraction.quests).toHaveLength(1);
  expect(extraction.journal.map((j) => j.content)).toEqual(["They forded the river."]);
  // The loss is ITEMIZED by the same function that built the extraction — the log can't disagree with what applied.
  expect(dropped).toHaveLength(1);
  expect(dropped[0]?.plane).toBe("journal");
  expect(dropped[0]?.index).toBe(0);
  expect(dropped[0]?.issues.join(" ")).toContain("content");
});

test("EXT-4a: a non-array plane drops WHOLE (index null); a malformed scene drops alone", () => {
  const { extraction, dropped } = salvageExtraction({
    party: "not an array",
    scene: { presentUpsert: "should be an array" },
    inventory: [{ targetRef: "player", walletDeltas: [{ name: "gold", delta: 25 }] }],
  });
  expect(extraction.party).toEqual([]);
  expect(extraction.scene).toBeUndefined();
  expect(extraction.inventory).toHaveLength(1); // the good plane beside them is untouched
  expect(dropped.map((d) => [d.plane, d.index])).toEqual([
    ["party", null],
    ["scene", null],
  ]);
});

test("EXT-4a: a payload that is not an object at all yields the empty extraction + ONE root drop", () => {
  for (const bad of [null, "a string", 42, ["an", "array"]]) {
    const { extraction, dropped } = salvageExtraction(bad);
    expect(extraction).toEqual({ party: [], inventory: [], trackers: [], quests: [], journal: [] });
    expect(dropped.map((d) => d.plane)).toEqual(["root"]);
  }
});

test("EXT-4a: a clean payload reports NOTHING dropped, and an omitted plane is not a drop", () => {
  const { extraction, dropped } = salvageExtraction({ scene: { location: "the tower" } });
  expect(dropped).toEqual([]);
  expect(extraction.party).toEqual([]); // omitted ⇒ empty, exactly like the schema default
  expect(extraction.scene?.location).toBe("the tower");
  expect(salvageExtraction({}).dropped).toEqual([]);
});

test("EXT-4a: salvage and the tool-call fold agree on the SAME payload (the shared-plane proof, drop-side)", () => {
  // The identical planes delivered the two ways: what survives must be identical, entry for entry.
  const journal = [
    { type: "note", title: "no body" },
    { type: "event", content: "They forded the river." },
  ];
  const scene = { location: "the ford" };
  const viaSchema = salvageExtraction({ scene, journal }).extraction;
  const viaCalls = toolCallsToExtraction([
    { name: "update_scene", arguments: JSON.stringify(scene) },
    ...journal.map((entry) => ({ name: "add_journal_entry", arguments: JSON.stringify(entry) })),
  ]);
  expect(viaSchema).toEqual(viaCalls);
});

// ── EXT-4b: the journal `type` heal — optional at parse, REQUIRED in the enforced grammar ────────────────
test("EXT-4b: healedJournalTypes names exactly the entries whose `type` the model omitted", () => {
  const { extraction } = salvageExtraction({
    journal: [{ content: "a kindless beat" }, { type: "combat", content: "The troll fell." }, { content: "another" }],
  });
  expect(extraction.journal).toHaveLength(3); // all three PARSED — the heal is not a drop
  expect([...healedJournalTypes(extraction)]).toEqual([0, 2]);
  expect(healedJournalTypes(toolCallsToExtraction([]))).toEqual([]);
});

test("EXT-4b: the PROJECTION re-requires journal[].type (prevention where the backend enforces it)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), BARE_REFS);
  expect(refEnum(constrained, ["properties", "journal", "items", "required"])).toEqual(expect.arrayContaining(["type", "content"]));
  // `title` stays OPTIONAL — it derives from the content head for free, so forcing it would spend tokens.
  expect(refEnum(constrained, ["properties", "journal", "items", "required"])).not.toContain("title");
  // The zod stays the loose superset (the heal arm for the wires that ignore nested `required`).
  expect(rpgExtractionSchema.safeParse({ journal: [{ content: "kindless" }] }).success).toBe(true);
});

// ── EXTRACTION_PLANE_PROMPTS — the §1.6 per-plane prompt-fragment registry + its RATCHET ─────────────────
const NO_REFS: ExtractionRefs = BARE_REFS;
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

test("RV-9: the scene fragment teaches WHEN to move time + weather (the panel's Waystone is a live clock, not decoration)", () => {
  // The owner finding: the Waystone "does not read as a clock" partly because the model never ADVANCES
  // timeOfDay/weather. Same class as the R4b gloss lesson — a field with no when-to-write clause goes
  // unwritten, so the teaching must name the triggers (time spent, sky turning), not just the field.
  const teaching = composePlaneTeaching({ config: baseConfig(), refs: NO_REFS });
  expect(teaching).toContain("KEEP TIME MOVING");
  expect(teaching).toContain("advance scene.timeOfDay");
  expect(teaching).toContain("never leave it parked");
  expect(teaching).toContain("whenever the story tells you what the sky is doing");
  // The enum + label split has to reach the PROSE too: a model that knows only "set weather" writes the
  // flavor into the type field, which the grammar then refuses.
  expect(teaching).toContain("scene.weather.type is one of clear/cloudy/rain/storm/snow/fog/wind/ash/indoors");
  expect(teaching).toContain("scene.weather.label");
  // WEATHER IS THE WORLD'S WEATHER. The eight SKY members can only describe a sky the scene can see, so an
  // enclosed scene had no legal value — and the old copy ("restate the current weather while it holds", "pick
  // the CLOSEST one") pushed the model to write one anyway. Live result: `weather.type: "indoors"`, which
  // failed the enum and (before salvage) discarded the WHOLE `update_scene` call — location, cast and
  // recentEvent with it, so a castle-interior game never established a scene at all.
  // …and the trigger is WHAT THE STORY SAYS ABOUT THE SKY, not where the characters are standing: a blizzard
  // closing in past a cabin window is the weather turning even though nobody went outside. An "outdoors only"
  // rule would suppress that legitimate change, so the copy is pinned on the story-tells-you framing.
  //
  // `indoors` is now a real member (owner ladder 2026-08-07), so the copy owes the model the THIRD case as
  // well: enclosed-with-no-sky is WRITABLE, not omitted. The omit rule survives for the genuinely unnameable
  // sky — the two are different states and the prompt must not collapse them, or the vocabulary and the
  // instruction disagree and the member is one the model is told never to use.
  expect(teaching).toContain("WORLD'S weather");
  expect(teaching).toContain("indoors or out");
  expect(teaching).toContain("story says nothing about the sky");
  expect(teaching).toContain('use "indoors" when the scene is enclosed and no sky is visible from it at all');
  expect(teaching).toContain("OMIT weather rather than forcing the nearest");
});

test("weather.type reaches the WIRE schema as an enum (the grammar binds it); weather.label stays free", () => {
  // The `timeOfDay` mechanism, applied to weather: the constraint is the zod enum itself, so every backend's
  // response_format mapping enforces it with zero per-provider code. Read off the PROJECTED schema — the thing
  // the model is actually handed.
  const projected = projectJsonSchema(rpgExtractionSchema) as Record<string, unknown>;
  const scene = (projected["properties"] as Record<string, Record<string, unknown>>)["scene"];
  const weather = (scene?.["properties"] as Record<string, Record<string, unknown>>)["weather"];
  const weatherProps = weather?.["properties"] as Record<string, Record<string, unknown>>;
  expect(weatherProps["type"]?.["enum"]).toEqual(["clear", "cloudy", "rain", "storm", "snow", "fog", "wind", "ash", "indoors"]);
  // The xgrammar-visible arm of the widening: `indoors` has to reach the PROJECTED schema, or the model is
  // constrained away from the exact value the prompt now tells it to send ([[xgrammar-enforced-schema…]]).
  expect(updateSceneArgsSchema.safeParse({ weather: { type: "indoors" } }).success).toBe(true);
  expect(weatherProps["label"]).toEqual({ type: "string", maxLength: 40 });
  // And the vocabulary binds at PARSE too (a folded tool round re-validates against the same schema).
  expect(updateSceneArgsSchema.safeParse({ weather: { type: "overcast" } }).success).toBe(false);
  expect(updateSceneArgsSchema.safeParse({ weather: { type: "cloudy", label: "low grey overcast" } }).success).toBe(true);
});

test("SCENE-DROPPED, THE SYMPTOM DYING: the exact live indoor payload now applies WHOLE, with nothing salvaged", () => {
  // This is the payload that was failing in production, verbatim from the wire capture on the castle-interior
  // chat: the model sent `weather.type: "indoors"`, the closed enum refused it, and the WHOLE `update_scene`
  // call was discarded — location, cast and recentEvent with it, so the game never established a scene at all.
  // EXT-4a's per-field salvage stopped that from being fatal but left a standing
  // `salvagedFields: ["update_scene.weather"]` on every indoor beat: the loss was reduced, not closed.
  //
  // With `indoors` in the vocabulary the whole call lands and the salvage list is EMPTY. That empty list is the
  // receipt — it is the difference between "the enum has a hole and we route around it" and "the model can say
  // what it means". Asserted through the REAL fold (`toolCallsToExtraction`) and the REAL loss reporter, not
  // through the schema alone, because the schema is not where the symptom was visible.
  const calls = [
    {
      name: "update_scene",
      arguments: JSON.stringify({
        location: "Throne Room",
        timeOfDay: "afternoon",
        recentEvent: "Alex arrived",
        weather: { type: "indoors", label: "dim infernal ambiance" },
      }),
    },
  ];

  expect(salvagedToolCallFields(calls)).toEqual([]);
  expect(malformedToolCalls(calls)).toEqual([]);
  const ex = toolCallsToExtraction(calls);
  expect(ex.scene?.location).toBe("Throne Room");
  expect(ex.scene?.recentEvent).toBe("Alex arrived");
  // The weather the model MEANT, both halves: the canonical type it can now express, and the vivid phrasing
  // that used to be the only place an indoor scene could put anything at all.
  expect(ex.scene?.weather).toEqual({ type: "indoors", label: "dim infernal ambiance" });

  // …and the salvage still WORKS — a genuinely unnameable value is still dropped field-wise, not call-wise.
  // Widening the vocabulary must not be mistaken for loosening the grammar.
  const bogus = [{ name: "update_scene", arguments: JSON.stringify({ location: "Throne Room", weather: { type: "sideways" } }) }];
  expect(salvagedToolCallFields(bogus)).toEqual(["update_scene.weather"]);
  expect(toolCallsToExtraction(bogus).scene?.location).toBe("Throne Room");
});

test("RV-9: the structured dateMode teaches WHEN the day counter ticks over (a night passed), not just that it exists", () => {
  const structured = rpgGameConfigSchema.parse({ dateMode: "structured" });
  const teaching = composePlaneTeaching({ config: structured, refs: NO_REFS });
  expect(teaching).toContain("advance it by one");
  expect(teaching).toContain("sleeps through the");
});

test("§1.6: the plot clause is GATED — plotProgression OFF drops it (applicability, no dead prompt)", () => {
  const off = rpgGameConfigSchema.parse({ features: { plotProgression: false } });
  expect(composePlaneTeaching({ config: off, refs: NO_REFS })).not.toContain("scene.plot");
});

test("§1.6: the game-tracker fragment is null when the game defines none, and names them when it does", () => {
  expect(composePlaneTeaching({ config: baseConfig(), refs: NO_REFS })).not.toContain("GAME TRACKERS");
  const config = rpgGameConfigSchema.parse({
    trackers: [{ key: "alarm", label: "Town alarm", shape: "meter", write: "set", subject: "game", max: 100, hint: "how hard the watch is looking" }],
  });
  const teaching = composePlaneTeaching({ config, refs: NO_REFS });
  expect(teaching).toContain("GAME TRACKERS");
  expect(teaching).toContain("Town alarm");
  expect(teaching).toContain("how hard the watch is looking");
});

test("R2/R6: the party teaching names THIS game's trackers by label + hint, split by the write axis", () => {
  // The R4b lesson generalized: a tracked value the model is told about only as a bare key does not steer.
  // The teaching is a TEMPLATE over the game's own defs — never a static vocabulary this game may not have.
  const config = rpgGameConfigSchema.parse({
    trackers: [
      { key: "grit", label: "Grit", shape: "meter", write: "delta", subject: "actor", max: 10, hint: "resolve you spend to push through danger" },
      { key: "corruption", label: "Corruption", shape: "meter", write: "set", subject: "actor", max: 100, hint: "rises with dark choices" },
      { key: "sealed", label: "Sealed", shape: "meter", write: "delta", subject: "actor", locked: true, hint: "the host owns this" },
    ],
  });
  const teaching = composePlaneTeaching({ config, refs: NO_REFS });
  expect(teaching).toContain("TRACKED RESOURCES");
  expect(teaching).toContain("Grit");
  expect(teaching).toContain("0-10");
  expect(teaching).toContain("resolve you spend to push through danger");
  expect(teaching).toContain("TRACKED STATES");
  expect(teaching).toContain("Corruption");
  expect(teaching).toContain("rises with dark choices");
  // A LOCKED tracker is not in the write schema, so teaching it would ask for what the grammar forbids.
  expect(teaching).not.toContain("Sealed");
});

test("R2: the per-game tool DESCRIPTIONS interpolate the game's own trackers (templates, never ship strings)", () => {
  const config = rpgGameConfigSchema.parse({
    trackers: [
      { key: "grit", label: "Grit", shape: "meter", write: "delta", subject: "actor", max: 10, hint: "resolve you spend to push through danger" },
      { key: "alarm", label: "Town alarm", shape: "meter", write: "set", subject: "game", max: 100, hint: "how hard the watch is looking" },
    ],
  });
  const described = buildRpgToolDescriptions({ config, refs: NO_REFS });
  const party = described.get("update_party") ?? "";
  expect(party).toContain("Grit");
  expect(party).toContain("resolve you spend to push through danger");
  expect(party).toContain("trackerDeltas:[{key:'grit'"); // the worked EXAMPLE speaks this game's vocabulary
  expect(described.get("set_tracker") ?? "").toContain("Town alarm");
  // The baseline (no game in scope — the tool-use registry's defs) names no game's trackers, but is the
  // SAME template: one home, so registry and wire can never say different things about the same tool.
  expect(RPG_BASELINE_TOOL_DESCRIPTIONS.get("update_party") ?? "").toContain("trackerDeltas");
  expect(RPG_BASELINE_TOOL_DESCRIPTIONS.get("update_party") ?? "").not.toContain("Grit");
});

test("EXT-4c: BOTH objective gestures are TAUGHT — the teaching and the tool description agree", () => {
  // A schema arm the model is never told about is a dead arm (the §1.6 plane-under-service class). The steer is
  // PROSE in both the plane teaching and the tool description — the model must learn that ticking one objective
  // off is `completeObjectives`, not a re-listing (which is what wiped the other flags before EXT-4c).
  const teaching = composePlaneTeaching({ config: baseConfig(), refs: NO_REFS });
  expect(teaching).toContain("completeObjectives");
  expect(teaching).toContain("do NOT restate the objective list");
  const quest = buildRpgToolDescriptions({ config: baseConfig(), refs: NO_REFS }).get("upsert_quest") ?? "";
  expect(quest).toContain("completeObjectives");
  expect(quest).toContain("never re-send objectives[] to report progress");
  // The registry baseline is the same render — registry and wire can never say different things.
  expect(RPG_BASELINE_TOOL_DESCRIPTIONS.get("upsert_quest") ?? "").toContain("completeObjectives");
});

test("MOOD IS A SHORT READ: the cast-mood steer rides both the teaching and update_scene's description", () => {
  // Owner report: models write whole sentences into `mood`, which janks the npc row. Taught in PROSE ONLY —
  // a schema maxLength would make the whole call unemittable on a non-enforcing wire and cost the beat.
  const teaching = composePlaneTeaching({ config: baseConfig(), refs: NO_REFS });
  expect(teaching).toContain("MOOD IS A SHORT READ");
  expect(teaching).toContain("1-3 words");
  expect(teaching).toContain("never a sentence");
  expect(RPG_BASELINE_TOOL_DESCRIPTIONS.get("update_scene") ?? "").toContain("NEVER a sentence");
  // …and the mood field itself stays UNCONSTRAINED in the projected schema (no maxLength/pattern belt).
  const moodNode = refEnum(projectJsonSchema(rpgExtractionSchema), ["properties", "scene", "properties", "presentUpsert", "items", "properties", "mood"]);
  expect(moodNode).toEqual({ type: "string" });
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
      { name: "add_journal_entry", arguments: JSON.stringify({ type: "event", label: "", title: "t", content: "c" }) },
    ]),
  ).toEqual([]);
});

// ── SCENE-DROPPED salvage (property test) ─────────────────────────────────────────
// "Every closed enum reachable from a tool arg can express what the reminder can RENDER" — for weather, the
// reminder (`weatherLine`/`rpgWeatherText`) renders WHATEVER STRING the model wrote in the free `label` field
// (label wins over type when present), so the render side is effectively unconstrained while the WRITE side
// (`weather.type`) is a closed enum. The live incident was exactly this gap: the model needed to describe an
// indoor scene (a state the fiction can render fine — it's just prose) and had no legal `type` to write.
//
// Written against `RPG_WEATHER_TYPES` AS IMPORTED (never a hardcoded member list) per the coordination note —
// correct on both sides of the sibling DOG-ENGINE lane's concurrent `indoors` addition.

test("SCENE-DROPPED property: every RPG_WEATHER_TYPES member (as imported) parses through the write schema", () => {
  // The write ⊆ render direction always holds: whatever the closed enum can write, the reminder can render
  // (rpgWeatherText/weatherLine just echoes the type string when no label is set — never a lookup that could
  // miss a member). Pinned so an enum addition can never silently create an unrenderable type.
  for (const type of RPG_WEATHER_TYPES) {
    expect(updateSceneArgsSchema.safeParse({ weather: { type } }).success, `weather.type "${type}" must be writable`).toBe(true);
  }
});

// ↓ WAS a declared `test.todo` FAILING-PIN (lane DOG-VERIFY): the reminder can render an indoor scene
// trivially (it's prose, via `weather.label`/`scene.location`), but `RPG_WEATHER_TYPES` had no interior member,
// so the literal token the model sent live ("indoors") was REJECTED at the write side. **FLIPPED TO LIVE by
// lane DOG-ENGINE, 2026-08-07** — `indoors` is in the vocabulary and the render/write asymmetry is closed.
// Kept (not deleted) because it is the crispest statement of what the defect actually WAS, and it is the
// tripwire if the member is ever removed. Asserted against the enum AS IMPORTED, never a member list.
test("SCENE-DROPPED property: the render side can express an indoor scene, and so can the write enum", () => {
  expect(RPG_WEATHER_TYPES).toContain("indoors");
  // Both directions, at the schema the model is actually bound by.
  expect(updateSceneArgsSchema.safeParse({ weather: { type: "indoors" } }).success).toBe(true);
});

test("SCENE-DROPPED salvage: an invalid OPTIONAL field costs only that field, not the whole call", () => {
  // The live shape: location/timeOfDay/recentEvent are all good; only `weather.type` is unwritable. The
  // salvage retries with the offending top-level field (`weather`) removed, so everything else applies.
  //
  // ⚠️ The offending value was `"indoors"` when this was written — that is now a LEGAL member (DOG-ENGINE),
  // so the value moved to one that is genuinely unnameable. The MECHANISM under test is unchanged and is the
  // point: an invalid optional field must cost that field, never the call. Closing the vocabulary hole must
  // not be allowed to quietly retire the salvage that made the hole survivable.
  const calls = [
    {
      name: "update_scene",
      arguments: JSON.stringify({ location: "Throne Room", timeOfDay: "afternoon", recentEvent: "Alex arrived", weather: { type: "sideways" } }),
    },
  ];
  expect(malformedToolCallDetails(calls)).toEqual([]); // salvaged, not dropped — not a whole-call loss
  expect([...salvagedToolCallFields(calls)]).toEqual(["update_scene.weather"]);
  expect(toolCallsToExtraction(calls).scene).toEqual({ location: "Throne Room", timeOfDay: "afternoon", recentEvent: "Alex arrived" });
});

// ── malformedToolCallDetails (TOOLDROP-BLIND — the regression `malformedToolCalls` used to BE) ──────────
// `malformedToolCalls` returned names only for a while, so a dropped `update_scene` was invisible as to WHY —
// the exact live incident (12/12 `update_scene` drops) that cost hours before a hand probe found the field.

test("TOOLDROP-BLIND: droppedIssues names the field, the reason, and the value the model SENT", () => {
  // A required field missing entirely — salvage cannot rescue it (nothing survives dropping `targetRef`,
  // which is a DROP not a salvage by the file's own rule), so this is a genuine whole-call loss.
  const calls = [{ name: "update_party", arguments: JSON.stringify({ status: "wounded" }) }];
  const details = malformedToolCallDetails(calls);
  expect(details).toHaveLength(1);
  expect(details[0]?.name).toBe("update_party");
  expect(details[0]?.issues).toHaveLength(1);
  expect(details[0]?.issues[0]).toContain("targetRef");
  // …and `malformedToolCalls` is `.map`ped off exactly this — the two cannot drift.
  expect([...malformedToolCalls(calls)]).toEqual(["update_party"]);
});

test("TOOLDROP-BLIND: non-JSON arguments carry their own single issue, not a field path", () => {
  const details = malformedToolCallDetails([{ name: "update_party", arguments: "{not json" }]);
  expect(details).toEqual([{ name: "update_party", issues: ["arguments: not valid JSON"] }]);
});

// ── recordToolCalls — the verdict is PER CALL, not per tool NAME (#1370) ────────────────────────────────
// The record is what `rpg_turn_tool_calls` stores and the user-facing disclosure reads. It used to join the
// loss lenses by `call.name` through a `Map`, so a turn with two `update_party` calls — one malformed, one
// valid — reported BOTH as dropped, with the malformed one's issues attached to the valid one. The fold
// applied the valid call's changes, so the row claimed a loss that never happened.

test("two calls to the SAME tool get independent verdicts — one dropped, one applied", () => {
  const good = JSON.stringify({ targetRef: "Kael", status: "wounded" });
  const bad = JSON.stringify({ status: "wounded" }); // no targetRef — a whole-call drop
  const record = recordToolCalls([
    { name: "update_party", arguments: bad },
    { name: "update_party", arguments: good },
  ]);
  expect(record.map((r) => r.verdict)).toEqual(["dropped", "applied"]);
  expect(record[0]?.issues[0]).toContain("targetRef");
  expect(record[1]?.issues).toEqual([]);
  expect(record[1]?.args).toBe(good);
});

test("the same independence holds for SALVAGED — a salvaged call does not paint its twin", () => {
  const clean = JSON.stringify({ location: "Throne Room", weather: { type: "indoors", label: "dim" } });
  // `location` survives, so the unnameable weather costs the FIELD, not the call (the salvage class).
  const salvageable = JSON.stringify({ location: "Throne Room", weather: { type: "sideways" } });
  const record = recordToolCalls([
    { name: "update_scene", arguments: salvageable },
    { name: "update_scene", arguments: clean },
  ]);
  expect(record.map((r) => r.verdict)).toEqual(["salvaged", "applied"]);
  expect([...(record[0]?.issues ?? [])]).toEqual(["update_scene.weather"]);
  expect(record[1]?.issues).toEqual([]);
});

// ── strippedToolCallKeys (D112 (3) — the SILENT class the drop predicate can't see) ─────────────────────
// `z.object` is strip-mode: a call carrying an undeclared key parses CLEAN with that key deleted. So a
// successful ToolCallRecord could hide a write that never happened, invisible to every existing channel.

test("D112 (3): a call that PARSES but carried an undeclared key is named, with its path", () => {
  // `hpDelta` is the live case: R3 retired it in favour of a `trackerDeltas` entry with `key:"hp"`, so a model
  // reaching for the old vocabulary lands a successful update_party whose damage silently never applied.
  const calls = [{ name: "update_party", arguments: JSON.stringify({ targetRef: "player", hpDelta: -3 }) }];
  expect(malformedToolCalls(calls)).toEqual([]); // the drop channel is blind to it, by construction
  expect([...strippedToolCallKeys(calls)]).toEqual(["update_party.hpDelta"]);
  expect(toolCallsToExtraction(calls).party).toEqual([{ targetRef: "player" }]); // …and this is what applied
});

test("D112 (3): strips are reported at DEPTH — inside a nested object and an array item", () => {
  expect([
    ...strippedToolCallKeys([
      {
        name: "update_scene",
        arguments: JSON.stringify({ weather: { type: "rain", intensity: 3 }, presentUpsert: [{ name: "Kael" }, { name: "Mira", vibe: "grim" }] }),
      },
    ]),
  ]).toEqual(["update_scene.weather.intensity", "update_scene.presentUpsert.1.vibe"]);
});

test("D112 (3): a DROPPED call is not double-counted as stripped, and no-ops/clean calls report nothing", () => {
  // Non-JSON and schema-invalid calls are whole-call losses `malformedToolCalls` already names.
  expect(
    strippedToolCallKeys([
      { name: "update_party", arguments: "{not json" },
      { name: "update_scene", arguments: JSON.stringify({ presentUpsert: "should be an array" }) },
    ]),
  ).toEqual([]);
  // `no_changes` / an unknown name meant to apply nothing, so nothing was stripped from it.
  expect(strippedToolCallKeys([{ name: RPG_NO_CHANGES_TOOL, arguments: JSON.stringify({ anything: 1 }) }])).toEqual([]);
  expect(strippedToolCallKeys([{ name: "update_scene", arguments: JSON.stringify({ location: "the ford" }) }])).toEqual([]);
});

test("D112 (3): the STRUCTURED arm reports the same strips — per entry, and for an undeclared ROOT plane key", () => {
  const { extraction, dropped, stripped } = salvageExtraction({
    party: [{ targetRef: "player", hpDelta: -3 }],
    scene: { location: "the ford", vibe: "tense" },
    // A whole plane under a key that names nothing: the per-plane walk never looks at it, so without the root
    // check this payload's entire tracker write would read as a quiet beat.
    trackerDeltas: [{ key: "hp", delta: -2 }],
  });
  expect(dropped).toEqual([]); // every entry CONFORMED — a strip is not a drop
  expect([...stripped]).toEqual(["trackerDeltas", "party.0.hpDelta", "scene.vibe"]);
  expect(extraction.party).toEqual([{ targetRef: "player" }]);
});

test("D112 (3): a clean payload reports nothing stripped (quiet on the happy path)", () => {
  expect(salvageExtraction({ scene: { location: "the ford" }, party: [{ targetRef: "player", status: "wounded" }] }).stripped).toEqual([]);
  expect(salvageExtraction({}).stripped).toEqual([]);
  expect(salvageExtraction("not an object").stripped).toEqual([]); // an unusable root is a DROP, not a strip
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// POPULATE-FROM-CHARACTER (owner ruling 2026-08-01) — the host BORN-STATE schema.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// The two invariants that make this a DOORWAY and not a hole: it REACHES the hand-only sheet fields (which is
// its whole reason to exist), and it CANNOT reach a live-play plane (structurally — schema AND salvage), so
// nothing about the turn vehicles' write surface changed by adding it.

test("POPULATE reaches the hand-only sheet fields — and the TURN schema still does not (the doorway, not a hole)", () => {
  const populateJson = JSON.stringify(projectJsonSchema(rpgPopulateSchema));
  expect(populateJson).toContain('"level"');
  expect(populateJson).toContain('"title"');
  // The law that stands: no turn vehicle gained a level write (the §2.6 progression-inflation guard).
  expect(JSON.stringify(projectJsonSchema(rpgExtractionSchema))).not.toContain("level");
});

test("POPULATE offers NO live-play plane — scene/party/trackers/journal are absent from the schema entirely", () => {
  const populateJson = JSON.stringify(projectJsonSchema(rpgPopulateSchema));
  for (const plane of ['"scene"', '"party"', '"trackers"', '"journal"']) {
    expect(populateJson).not.toContain(plane);
  }
  expect(populateJson).toContain('"inventory"');
  expect(populateJson).toContain('"quests"');
});

test("POPULATE salvage DISCARDS a live-play plane even when a non-enforcing wire volunteers one", () => {
  const { extraction, sheet } = salvagePopulate({
    sheet: { title: "Warden of House Vane", level: 3 },
    inventory: [{ targetRef: "Mara", add: [{ name: "Bone key", quantity: 1 }], walletDeltas: [{ name: "gold", delta: 20 }] }],
    quests: [{ name: "Find the vault", action: "create" }],
    // The planes a card read must never write — emitted anyway (an unconstrained wire), and dropped on the floor.
    scene: { location: "the tower" },
    party: [{ targetRef: "Mara", hpDelta: -5 }],
    trackers: [{ key: "alarm", value: 30 }],
    journal: [{ type: "note", content: "a beat" }],
  });
  expect(sheet).toEqual({ title: "Warden of House Vane", level: 3 });
  expect(extraction.inventory).toHaveLength(1);
  expect(extraction.quests).toHaveLength(1);
  expect(extraction.scene).toBeUndefined();
  expect(extraction.party).toEqual([]);
  expect(extraction.trackers).toEqual([]);
  expect(extraction.journal).toEqual([]);
});

test("POPULATE salvage is PER-ENTRY (EXT-4a): a bad item drops alone, and a bad sheet costs only the sheet", () => {
  const { sheet, extraction, dropped } = salvagePopulate({
    sheet: { level: -3 }, // below the min ⇒ the sheet half is refused whole
    inventory: [{ targetRef: "Mara", add: [{ name: "Rope" }] }, { add: [{ name: "no target" }] }],
    quests: [{ name: "Find the vault", action: "create" }],
  });
  expect(sheet).toBeNull();
  expect(extraction.inventory).toHaveLength(1);
  expect(extraction.quests).toHaveLength(1); // the quests beside the bad entries survive
  expect(dropped.map((d) => d.plane).sort()).toEqual(["inventory", "root"]);
});

test("POPULATE: an empty round parses (a card that established nothing), and a non-object yields ONE root drop", () => {
  expect(rpgPopulateSchema.parse({})).toEqual({ inventory: [], quests: [] });
  const { sheet, extraction, dropped } = salvagePopulate("not an object");
  expect(sheet).toBeNull();
  expect(extraction).toEqual({ party: [], inventory: [], trackers: [], quests: [], journal: [] });
  expect(dropped.map((d) => d.plane)).toEqual(["root"]);
});

test("POPULATE constraint pins inventory.targetRef to the ONE character and REQUIRES the sheet fields (the xgrammar lever)", () => {
  // WireReady is an opaque branded Record; widen to the plain record (assignable, no cast) then read its shape.
  const populated: Record<string, unknown> = constrainPopulateSchema(projectJsonSchema(rpgPopulateSchema), "Mara");
  const constrained = populated as {
    required?: string[];
    properties: { sheet: { required?: string[] }; inventory: { items: { properties: { targetRef: { enum?: string[] } } } } };
  };
  expect(constrained.properties.inventory.items.properties.targetRef.enum).toEqual(["Mara"]);
  expect(constrained.required).toContain("sheet");
  expect((constrained.properties.sheet.required ?? []).toSorted()).toEqual(["level", "title"]);
  // …and the input projection is untouched (the cached schema also feeds other wires).
  const projected = projectJsonSchema(rpgPopulateSchema) as { required?: string[] };
  expect(projected.required ?? []).not.toContain("sheet");
});

test("POPULATE teaching: the two born planes + the invent-nothing doctrine, and NO live-play plane fragment", () => {
  const config = rpgGameConfigSchema.parse({});
  const teaching = composePopulateTeaching({ config, refs: { ...BARE_REFS, actorRefs: ["Mara"] } });
  expect(teaching).toContain("sheet.title");
  expect(teaching).toContain("INVENTORY");
  expect(teaching).toContain("QUESTS");
  expect(teaching).toContain("Do NOT invent");
  // The live-play fragments the turn teaching carries are absent here (a card read is not a beat).
  expect(teaching).not.toContain("SCENE —");
  expect(teaching).not.toContain("JOURNAL —");
});

test("POPULATE teaching carries the deception surface-only clause on a deception-active game", () => {
  const refs = { ...BARE_REFS, actorRefs: ["Mara"] };
  const plain = composePopulateTeaching({ config: rpgGameConfigSchema.parse({}), refs });
  const deceptive = composePopulateTeaching({ config: rpgGameConfigSchema.parse({ features: { deception: true } }), refs });
  expect(plain).not.toContain("hidden layers");
  expect(deceptive).toContain("hidden layers");
});

// ── the WIRE-SUBSET pins, over the REAL projected schema ─────────────────────────────────────────────
// `tests/contracts/inference/wire-subset.test.ts` pins the ENGINE against a synthetic payload; these pin the
// PRODUCT — what THIS schema actually puts on each wire after `projectJsonSchema` + `constrainExtractionSchema`.
// No static gate can compute it (it needs zod evaluated), and the synthetic payload cannot catch it: a NEW
// refinement in `contracts/src/rpg/tools.ts` (a `.regex()` → `pattern`, a `.length()` → `minLength`) lands a
// keyword the engine's table never heard of, and the hosted request 400s in production instead of here.
// Vendor sources (fetched 2026-08-03, 2026-08-03):
//   • Anthropic — string/numeric/array/object BOUND keywords are NOT supported by the structured-output subset.
//   • OpenAI — string bounds unsupported; numeric supported. The hosted mode carries the strictest COMMON subset.
//   • vLLM/xgrammar — guided decoding ENFORCES the bounds, so they must SURVIVE there (the populate lever: an
//     8B skips optional fields unless the compiled grammar requires the shape).

/** Every KEYWORD in a schema tree, position-aware: under `properties`/`$defs`/`definitions` the keys are field
 *  NAMES, not keywords, so they are stepped over (a field called `title` is data, not an annotation). */
function wireKeywords(node: unknown, acc: Set<string> = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    for (const item of node) {
      wireKeywords(item, acc);
    }
    return acc;
  }
  if (node === null || typeof node !== "object") {
    return acc;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    acc.add(key);
    if (NAME_MAP_KEYS.has(key) && value !== null && typeof value === "object" && !Array.isArray(value)) {
      for (const child of Object.values(value as Record<string, unknown>)) {
        wireKeywords(child, acc);
      }
      continue;
    }
    wireKeywords(value, acc);
  }
  return acc;
}

const NAME_MAP_KEYS = new Set<string>(["properties", "$defs", "definitions"]);

// The keywords NO hosted request may carry — the union of what Anthropic documents as unsupported and what
// `z.toJSONSchema` stamps outside either vendor's list. Spelled out here on purpose: this is the VENDOR
// contract restated independently of the engine, so an engine edit that quietly drops a keyword from its own
// table cannot also quietly relax this pin.
const HOSTED_BANNED = [
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minItems",
  "maxItems",
  "minProperties",
  "maxProperties",
  "$schema",
  "$id",
] as const;

// The keywords a hosted request MAY carry. An addition here is an owner decision — check it against A1/O1's
// supported list first. This is the arm that catches a NEW keyword class (`pattern`, `format`, `const`,
// `propertyNames`, `contains`, `dependentRequired`, `unevaluatedProperties`) the day a refinement introduces it.
const HOSTED_ALLOWED = new Set<string>([
  "type",
  "properties",
  "required",
  "items",
  "enum",
  "additionalProperties",
  "description",
  "default",
  "anyOf",
  "allOf",
  "$defs",
  "$ref",
]);

const WIRE_REFS: ExtractionRefs = { ...BARE_REFS, actorRefs: ["You"] };

test("WIRE: the real extraction schema carries NO banned keyword on either hosted projection", () => {
  const projected = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), WIRE_REFS);
  // The UNSCRUBBED projection really does emit them — otherwise these pins would be vacuously green.
  const raw = wireKeywords(projected);
  expect([...raw].filter((k) => (HOSTED_BANNED as readonly string[]).includes(k)).sort()).toEqual(["$schema", "maxLength", "maximum", "minLength", "minimum"]);
  for (const mode of ["hosted-common", "anthropic-format"] as const) {
    const keywords = wireKeywords(scrubWireSchema(projected, mode).schema);
    expect({ mode, banned: HOSTED_BANNED.filter((k) => keywords.has(k)) }).toEqual({ mode, banned: [] });
    // …and nothing OUTSIDE the documented subset either — the arm that catches a keyword class nobody knew about.
    expect({ mode, unknown: [...keywords].filter((k) => !HOSTED_ALLOWED.has(k)).sort() }).toEqual({ mode, unknown: [] });
  }
});

test("WIRE: guided decoding KEEPS the bounds — the xgrammar populate lever survives the scrub", () => {
  const projected = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), WIRE_REFS);
  const keywords = wireKeywords(scrubWireSchema(projected, "guided-decoding").schema);
  // These COMPILE into the grammar. A blanket strip would silently disarm the only enforcing wire we drive.
  for (const kept of ["minLength", "maxLength", "minimum", "maximum"]) {
    expect({ kept, present: keywords.has(kept) }).toEqual({ kept, present: true });
  }
  // The dialect meta key still comes off (the vLLM `--json-schema` validator refuses it), as do the annotations.
  expect(keywords.has("$schema")).toBe(false);
  expect(keywords.has("default")).toBe(false);
  // The populate schema rides the same wire under the same rule.
  expect(wireKeywords(scrubWireSchema(projectJsonSchema(rpgPopulateSchema), "guided-decoding").schema).has("minLength")).toBe(true);
});

test("WIRE: the Anthropic wire REFUSES the multi-group extraction schema (oneOf), and accepts the single-group one", () => {
  // One tracker write group ⇒ a flat schema; several ⇒ a `oneOf` branch each, which is exactly the construct
  // Anthropic's subset omits. The refusal is LOUD by design (D93: flatten at build time, never ship it).
  const bound = tracker({ key: "bound_will", label: "Bound Will", shape: "meter", write: "delta", subject: "actor", appliesTo: "npcs" });
  const groups = buildTrackerWriteGroups(
    [MANA, bound],
    [carrier("Kael", "party", { grants: ["bound_will"] }), carrier("Sera", "party", { revokes: ["mana"] })],
  );
  const multi = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), { ...WIRE_REFS, actorRefs: ["Kael", "Sera"], trackerWriteGroups: groups });
  expect(wireKeywords(multi).has("oneOf")).toBe(true);
  expect(scrubWireSchema(multi, "anthropic-format").refused).toEqual(["oneOf"]);
  // Every other wire carries it: the forced-tool vehicle compiles no grammar, and xgrammar accepts unions.
  expect(scrubWireSchema(multi, "hosted-common").refused).toEqual([]);
  expect(scrubWireSchema(multi, "guided-decoding").refused).toEqual([]);
  // The common single-group game is clean on all four.
  const flat = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), WIRE_REFS);
  expect(scrubWireSchema(flat, "anthropic-format").refused).toEqual([]);
});
