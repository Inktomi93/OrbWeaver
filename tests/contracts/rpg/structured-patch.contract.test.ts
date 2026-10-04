// @orb/contracts/rpg structured-patch — the PATCH-LIST shape of the structured state round. Pinned: the schema is
// generated from the round's own (constrained) wire tools and carries no optional and no union-typed property on any
// wire; the decoder only assembles each call's raw arguments (shaped by declared type, never parsed as JSON), so a
// patch reply and a tool call with the same intent leave the SAME record, verdict, issues and fold; `(plane, call)`
// groups calls and `item` groups array elements; an entry that cannot form an argument rides its own recorded call.

import { checkWireSchema, structuredSchemaComplexity, WIRE_SCHEMA_MODES } from "@orb/contracts/inference";
import type { ExtractionRefs, RpgStateRoundTool, RpgToolCall } from "@orb/contracts/rpg";
import {
  constrainExtractionSchema,
  describePatchFields,
  malformedToolCallDetails,
  malformedToolCalls,
  patchChangesToToolCalls,
  patchFieldPaths,
  patchToolsOnlyFields,
  RPG_PATCH_INDEX_MAX,
  recordToolCalls,
  rpgExtractionSchema,
  salvagedToolCallFields,
  stateRoundPatchSchema,
  strippedToolCallKeys,
  toolCallsToExtraction,
} from "@orb/contracts/rpg";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { z } from "zod";
import { expect, test } from "../../support/fixtures.ts";

const REFS: ExtractionRefs = {
  actorRefs: ["Mira", "Corvin"],
  trackerWriteGroups: [],
  gameTrackerKeys: { deltaKeys: ["gold"], setKeys: ["omen"] },
  conditionNames: ["Bleeding"],
  establishScene: { location: false, timeOfDay: false, presentCast: false },
};

/** A per-actor tracker split: the party tool's parameters become one `oneOf` branch per actor group. */
const SPLIT_REFS: ExtractionRefs = {
  ...REFS,
  trackerWriteGroups: [
    { targetRefs: ["Mira"], deltaKeys: ["hp"], setKeys: [] },
    { targetRefs: ["Corvin"], deltaKeys: ["mana"], setKeys: [] },
  ],
};

/** The round's wire tools as the compose builds them: each plane lifted from ONE constrained projection. */
function roundTools(refs: ExtractionRefs): RpgStateRoundTool[] {
  const constrained = z
    .object({ properties: z.record(z.string(), z.record(z.string(), z.unknown())) })
    .parse(constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), refs));
  const plane = (field: string): Record<string, unknown> => {
    const node = constrained.properties[field] ?? {};
    return z.record(z.string(), z.unknown()).safeParse(node["items"]).data ?? node;
  };
  const tool = (name: string, parameters: Record<string, unknown>): RpgStateRoundTool => ({ name, description: `${name} help`, parameters });
  return [
    tool("update_party", plane("party")),
    tool("update_inventory", plane("inventory")),
    tool("update_scene", plane("scene")),
    tool("set_tracker", plane("trackers")),
    tool("upsert_quest", plane("quests")),
    tool("add_journal_entry", plane("journal")),
    tool("no_changes", { type: "object", properties: {}, additionalProperties: false }),
  ];
}

const TOOLS = roundTools(REFS);
const SPLIT_TOOLS = roundTools(SPLIT_REFS);

type Entry = Readonly<Record<string, unknown>>;

/** One patch entry at `item` 0, the id every field but a list of things takes; spread and override `item` for those. */
function entry(plane: string, call: number, field: string, value: string): Entry {
  return { plane, call, field, item: 0, value };
}

function decode(changes: readonly Entry[], tools: readonly RpgStateRoundTool[] = TOOLS): ReturnType<typeof patchChangesToToolCalls> {
  return patchChangesToToolCalls({ changes }, tools);
}

function argsOf(decoded: ReturnType<typeof patchChangesToToolCalls>): readonly { readonly name: string; readonly args: unknown }[] {
  return (decoded?.calls ?? []).map((call) => ({ name: call.name, args: JSON.parse(call.arguments) as unknown }));
}

/** Everything the shared path derives from a call set: the full record (args, verdict, issues), the drop and salvage
 *  lenses, the strip lens and the fold. Two vehicles with equal intent must agree on all of it. */
function sharedView(calls: readonly RpgToolCall[]): unknown {
  return {
    record: recordToolCalls(calls),
    malformed: malformedToolCallDetails(calls),
    salvaged: salvagedToolCallFields(calls),
    stripped: strippedToolCallKeys(calls),
    fold: toolCallsToExtraction(calls),
  };
}

const PROJECTED_PATCH = z.object({
  properties: z.object({
    changes: z.object({
      minItems: z.number(),
      items: z.object({
        anyOf: z.array(z.object({ properties: z.record(z.string(), z.object({ enum: z.array(z.string()).optional() })), required: z.array(z.string()) })),
      }),
    }),
  }),
});

test("the patch-list schema enumerates each tool's own field paths, every property required, no optional and no union-typed property", () => {
  const projected = projectJsonSchema(stateRoundPatchSchema(TOOLS));
  const schema = PROJECTED_PATCH.parse(projected);
  const members = schema.properties.changes.items.anyOf;

  expect(structuredSchemaComplexity(projected)).toEqual({ optionalProps: 0, unionProps: 0 });
  expect(schema.properties.changes.minItems).toBe(1);
  expect(members.map((member) => member.properties["plane"]?.enum?.[0])).toEqual(TOOLS.map((tool) => tool.name));
  expect(members[0]?.required).toEqual(["plane", "call", "field", "item", "value"]);
  expect(members[2]?.properties["field"]?.enum).toEqual(patchFieldPaths(TOOLS[2] as RpgStateRoundTool));
  expect(members[2]?.properties["field"]?.enum).toEqual(
    expect.arrayContaining(["location", "weather.type", "presentUpsert.relationship.kind", "presentRemove", "plot.act"]),
  );
  // Every field of every state tool is reachable: nothing nests an object list inside an object list today.
  expect(TOOLS.flatMap((tool) => patchToolsOnlyFields(tool))).toEqual([]);
});

test("the patch-list schema fits every wire mode under every mode's ceilings, flat or split per actor", () => {
  for (const tools of [TOOLS, SPLIT_TOOLS]) {
    const projected = projectJsonSchema(stateRoundPatchSchema(tools));
    expect(structuredSchemaComplexity(projected)).toEqual({ optionalProps: 0, unionProps: 0 });
    for (const mode of WIRE_SCHEMA_MODES) {
      for (const limitsFrom of WIRE_SCHEMA_MODES) {
        expect(checkWireSchema([projected], mode, limitsFrom)).toEqual({ fits: true, violations: [] });
      }
    }
  }
});

// ── one validation path: equal intent leaves an equal record ────────────────────────────────────────────────────

interface Intent {
  readonly label: string;
  readonly tools?: readonly RpgStateRoundTool[];
  readonly entries: readonly Entry[];
  readonly tool: RpgToolCall;
}

function scene(...entries: readonly (readonly [string, string])[]): readonly Entry[] {
  return entries.map(([field, value]) => entry("update_scene", 0, field, value));
}

/** Digits no double holds: a tool call's `JSON.parse` reads them as Infinity. */
const TOO_LARGE = "1".padEnd(400, "0");

const INTENTS: readonly Intent[] = [
  {
    label: "a refused enum beside a kept field",
    entries: scene(["location", "the inn"], ["timeOfDay", "Evening"]),
    tool: { name: "update_scene", arguments: JSON.stringify({ location: "the inn", timeOfDay: "Evening" }) },
  },
  {
    label: "a refused enum alone",
    entries: scene(["timeOfDay", "Evening"]),
    tool: { name: "update_scene", arguments: JSON.stringify({ timeOfDay: "Evening" }) },
  },
  {
    label: "a refused nested enum beside a kept field",
    entries: scene(["location", "inn"], ["weather.type", "plasma"]),
    tool: { name: "update_scene", arguments: JSON.stringify({ location: "inn", weather: { type: "plasma" } }) },
  },
  {
    label: "a refused nested enum beside its sibling",
    entries: scene(["weather.type", "plasma"], ["weather.label", "odd"]),
    tool: { name: "update_scene", arguments: JSON.stringify({ weather: { type: "plasma", label: "odd" } }) },
  },
  {
    label: "text in a numeric field, alone",
    entries: scene(["day", "abc"]),
    tool: { name: "update_scene", arguments: JSON.stringify({ day: "abc" }) },
  },
  {
    label: "text in a numeric field beside a kept field",
    entries: scene(["location", "inn"], ["day", "abc"]),
    tool: { name: "update_scene", arguments: JSON.stringify({ location: "inn", day: "abc" }) },
  },
  {
    label: "a number below the field's minimum",
    entries: scene(["day", "0"]),
    tool: { name: "update_scene", arguments: JSON.stringify({ day: 0 }) },
  },
  {
    label: "a refused value inside one element of a list of things",
    entries: [
      entry("update_scene", 0, "presentUpsert.name", "Oren"),
      entry("update_scene", 0, "presentUpsert.relationship.kind", "frenemy"),
      ...scene(["location", "inn"]),
    ],
    tool: { name: "update_scene", arguments: JSON.stringify({ presentUpsert: [{ name: "Oren", relationship: { kind: "frenemy" } }], location: "inn" }) },
  },
  {
    label: "text in an element's numeric field",
    entries: [
      entry("update_inventory", 0, "targetRef", "Mira"),
      entry("update_inventory", 0, "add.name", "rope"),
      entry("update_inventory", 0, "add.quantity", "lots"),
    ],
    tool: { name: "update_inventory", arguments: JSON.stringify({ targetRef: "Mira", add: [{ name: "rope", quantity: "lots" }] }) },
  },
  {
    label: "a target outside the round's actors",
    entries: [entry("update_party", 0, "targetRef", "Zed"), entry("update_party", 0, "status", "x")],
    tool: { name: "update_party", arguments: JSON.stringify({ targetRef: "Zed", status: "x" }) },
  },
  {
    label: "a condition no actor carries",
    entries: [entry("update_party", 0, "targetRef", "Mira"), entry("update_party", 0, "addCondition.name", "Poisoned")],
    tool: { name: "update_party", arguments: JSON.stringify({ targetRef: "Mira", addCondition: { name: "Poisoned" } }) },
  },
  {
    label: "a call with no target",
    entries: [entry("update_party", 0, "status", "bloodied")],
    tool: { name: "update_party", arguments: JSON.stringify({ status: "bloodied" }) },
  },
  {
    label: "a tracker key the named actor does not carry, across a per-actor split",
    tools: SPLIT_TOOLS,
    entries: [
      entry("update_party", 0, "targetRef", "Corvin"),
      entry("update_party", 0, "trackerDeltas.key", "hp"),
      entry("update_party", 0, "trackerDeltas.delta", "-2"),
      entry("update_party", 0, "status", "bloodied"),
    ],
    tool: { name: "update_party", arguments: JSON.stringify({ targetRef: "Corvin", trackerDeltas: [{ key: "hp", delta: -2 }], status: "bloodied" }) },
  },
  {
    label: "a number too large for a double, in a number-or-text field",
    entries: [entry("set_tracker", 0, "key", "omen"), entry("set_tracker", 0, "value", TOO_LARGE)],
    tool: { name: "set_tracker", arguments: `{"key":"omen","value":${TOO_LARGE}}` },
  },
  {
    label: "a number too large for a double, beside a kept field",
    entries: scene(["location", "inn"], ["day", TOO_LARGE]),
    tool: { name: "update_scene", arguments: `{"location":"inn","day":${TOO_LARGE}}` },
  },
  {
    label: "a number written with a trailing zero keeps the digits sent",
    entries: scene(["location", "inn"], ["day", "1.50"]),
    tool: { name: "update_scene", arguments: '{"location":"inn","day":1.50}' },
  },
  {
    label: "a long refused value",
    entries: scene(["timeOfDay", "x".repeat(200)]),
    tool: { name: "update_scene", arguments: JSON.stringify({ timeOfDay: "x".repeat(200) }) },
  },
];

test("for every intent, the patch reply leaves the tool round's exact record: args as sent, verdict, issues, drops and fold", () => {
  for (const intent of INTENTS) {
    const decoded = decode(intent.entries, intent.tools);

    expect({ label: intent.label, view: sharedView(decoded?.calls ?? []) }).toEqual({ label: intent.label, view: sharedView([intent.tool]) });
    expect(decoded?.dropped).toEqual([]);
  }
});

test("the record keeps the value the model sent, and a refused nested value reports the tool round's path and message", () => {
  const [salvaged] = recordToolCalls(decode(scene(["location", "the inn"], ["timeOfDay", "Evening"]))?.calls ?? []);
  expect(salvaged).toEqual({
    name: "update_scene",
    args: '{"location":"the inn","timeOfDay":"Evening"}',
    verdict: "salvaged",
    issues: ["update_scene.timeOfDay"],
  });

  expect(recordToolCalls(decode(scene(["location", "inn"], ["weather.type", "plasma"]))?.calls ?? [])[0]?.issues).toEqual(["update_scene.weather"]);
  const [nested] = recordToolCalls(decode(scene(["weather.type", "plasma"], ["weather.label", "odd"]))?.calls ?? []);
  expect(nested?.verdict).toBe("dropped");
  expect(nested?.issues).toEqual([expect.stringMatching(/^weather\.type: Invalid option: .* — sent "plasma"$/u)]);

  // The message is the shared parse's own: a text value in a numeric field reads "expected number".
  const [numeric] = recordToolCalls(decode(scene(["day", "abc"]))?.calls ?? []);
  expect(numeric?.issues).toEqual(['day: Invalid input: expected number, received string — sent "abc"']);
});

test("no issue line claims a value was absent when the model sent one", () => {
  for (const intent of INTENTS.filter((candidate) => candidate.label !== "a call with no target")) {
    const issues = recordToolCalls(decode(intent.entries, intent.tools)?.calls ?? []).flatMap((call) => call.issues);
    expect({ label: intent.label, issues: issues.filter((issue) => issue.includes("(absent)")) }).toEqual({ label: intent.label, issues: [] });
  }
});

test("a wholly refused patch call is a recorded DROP, writes nothing, and is not a usable call (a downgraded round still retries)", () => {
  const calls = decode(scene(["timeOfDay", "Evening"]))?.calls ?? [];

  expect(recordToolCalls(calls)[0]?.verdict).toBe("dropped");
  expect(toolCallsToExtraction(calls).scene).toBeUndefined();
  expect(malformedToolCalls(calls)).toEqual(["update_scene"]);
});

// ── assembly ────────────────────────────────────────────────────────────────────────────────────────────────────

test("two journal entries stay two calls: `call` groups, so the second title never lands on the first entry", () => {
  const decoded = decode([
    entry("add_journal_entry", 0, "type", "combat"),
    entry("add_journal_entry", 0, "content", "Corvin wounds Mira."),
    entry("add_journal_entry", 1, "title", "The cave"),
    entry("add_journal_entry", 1, "content", "They reach the cave."),
  ]);

  expect(argsOf(decoded)).toEqual([
    { name: "add_journal_entry", args: { type: "combat", content: "Corvin wounds Mira." } },
    { name: "add_journal_entry", args: { title: "The cave", content: "They reach the cave." } },
  ]);
});

test("two actors stay two update_party calls, each with its own condition and status, whatever order the fields come in", () => {
  const decoded = decode([
    entry("update_party", 0, "status", "wounded"),
    entry("update_party", 1, "targetRef", "Corvin"),
    entry("update_party", 0, "targetRef", "Mira"),
    entry("update_party", 0, "addCondition.name", "Bleeding"),
    entry("update_party", 1, "removeCondition", "Bleeding"),
    entry("update_party", 1, "status", "grim"),
  ]);

  expect(argsOf(decoded)).toEqual([
    { name: "update_party", args: { status: "wounded", targetRef: "Mira", addCondition: { name: "Bleeding" } } },
    { name: "update_party", args: { targetRef: "Corvin", removeCondition: "Bleeding", status: "grim" } },
  ]);
});

test("values are shaped by declared type only: strict digits for numbers, every other text kept as sent — never JSON", () => {
  const decoded = decode([
    entry("update_scene", 0, "day", "3"),
    entry("update_scene", 0, "plot.act", "two"),
    entry("update_scene", 0, "location", '{"a":1}'),
    entry("update_inventory", 0, "targetRef", "Mira"),
    entry("update_inventory", 0, "add.name", "rope"),
    entry("update_inventory", 0, "add.quantity", "1.5"),
    entry("update_inventory", 0, "walletDeltas.delta", "[5]"),
  ]);

  expect(argsOf(decoded)).toEqual([
    { name: "update_scene", args: { day: 3, plot: { act: "two" }, location: '{"a":1}' } },
    { name: "update_inventory", args: { targetRef: "Mira", add: [{ name: "rope", quantity: 1.5 }], walletDeltas: [{ delta: "[5]" }] } },
  ]);
});

test('a number|string field prefers the number, so `"5"` lands as 5 and folds exactly like the tool call that sent 5', () => {
  const decoded = decode([
    entry("set_tracker", 0, "key", "omen"),
    entry("set_tracker", 0, "value", "5"),
    entry("set_tracker", 1, "key", "omen"),
    entry("set_tracker", 1, "value", "crows at dawn"),
  ]);

  expect(argsOf(decoded)).toEqual([
    { name: "set_tracker", args: { key: "omen", value: 5 } },
    { name: "set_tracker", args: { key: "omen", value: "crows at dawn" } },
  ]);
  expect(toolCallsToExtraction(decoded?.calls.slice(0, 1) ?? [])).toEqual(
    toolCallsToExtraction([{ name: "set_tracker", arguments: JSON.stringify({ key: "omen", value: 5 }) }]),
  );
});

test("lists: plain words append one entry each; a list of things takes one `item` per thing, its fields grouped by item", () => {
  const decoded = decode([
    entry("update_scene", 0, "presentRemove", "Corvin"),
    entry("update_scene", 0, "presentRemove", "Mira"),
    { ...entry("update_scene", 0, "presentUpsert.name", "Vesna"), item: 1 },
    entry("update_scene", 0, "presentUpsert.name", "Oren"),
    { ...entry("update_scene", 0, "presentUpsert.relationship.kind", "ally"), item: 1 },
    entry("update_scene", 0, "presentUpsert.mood", "wary"),
  ]);

  expect(argsOf(decoded)).toEqual([
    {
      name: "update_scene",
      args: {
        presentRemove: ["Corvin", "Mira"],
        presentUpsert: [
          { name: "Oren", mood: "wary" },
          { name: "Vesna", relationship: { kind: "ally" } },
        ],
      },
    },
  ]);
});

test("a boolean field shapes only `true` or `false`; any other text is kept for the parse to refuse", () => {
  const toggles: RpgStateRoundTool = { name: "toggle", description: "", parameters: { type: "object", properties: { lit: { type: "boolean" } } } };

  const decoded = patchChangesToToolCalls({ changes: [entry("toggle", 0, "lit", "true"), entry("toggle", 1, "lit", "yes")] }, [toggles]);

  expect(argsOf(decoded)).toEqual([
    { name: "toggle", args: { lit: true } },
    { name: "toggle", args: { lit: "yes" } },
  ]);
});

// ── entries that cannot form an argument ────────────────────────────────────────────────────────────────────────

/** What a reader of the record sees for an unassembled row: one issue per entry, naming its cause. The path half is
 *  a fixed schema label; every name the model sent rides in the sent half, the only half a member's view belts. */
const NOT_A_SCENE_FIELD = "(field): update_scene has no such field, so this value was dropped";

test("a prototype key never reaches a lookup: it is a recorded DROP naming the cause, carried as sent, beside the call that applied", () => {
  const unknown = [entry("update_scene", 0, "constructor", "x"), entry("update_scene", 0, "toString", "x"), entry("update_scene", 0, "__proto__", "y")];
  const decoded = decode([...unknown, entry("update_scene", 0, "location", "the inn")]);

  expect(decoded?.dropped).toEqual(["update_scene.constructor", "update_scene.toString", "update_scene.__proto__"]);
  expect(decoded?.calls).toEqual([{ name: "update_scene", arguments: '{"location":"the inn"}' }]);
  expect(decoded?.unassembled).toEqual([
    {
      name: "update_scene",
      args: JSON.stringify(unknown),
      verdict: "dropped",
      issues: [
        `${NOT_A_SCENE_FIELD} — sent {"field":"constructor","value":"x"}`,
        `${NOT_A_SCENE_FIELD} — sent {"field":"toString","value":"x"}`,
        `${NOT_A_SCENE_FIELD} — sent {"field":"__proto__","value":"y"}`,
      ],
    },
  ]);
  expect(toolCallsToExtraction(decoded?.calls ?? []).scene).toEqual({ location: "the inn" });
});

test("a field set twice in one call keeps the LATER value, as a tool call's repeated JSON key does", () => {
  const decoded = decode([
    entry("update_scene", 0, "location", "the inn"),
    entry("update_scene", 0, "location", "the road"),
    entry("update_scene", 0, "presentUpsert.name", "A"),
    entry("update_scene", 0, "presentUpsert.name", "B"),
  ]);
  const toolRound = { name: "update_scene", arguments: '{"location":"the inn","location":"the road","presentUpsert":[{"name":"A","name":"B"}]}' };

  expect(argsOf(decoded)).toEqual([{ name: "update_scene", args: { location: "the road", presentUpsert: [{ name: "B" }] } }]);
  expect(toolCallsToExtraction(decoded?.calls ?? [])).toEqual(toolCallsToExtraction([toolRound]));
  expect(decoded?.dropped).toEqual([]);
});

test("a tool the round does not offer is a recorded DROP naming why, never a write, even when its name is a real state tool", () => {
  const noTrackers = roundTools({ ...REFS, gameTrackerKeys: { deltaKeys: [], setKeys: [] } }).filter((tool) => tool.name !== "set_tracker");
  const sent = [entry("set_tracker", 0, "key", "gold"), entry("set_tracker", 0, "delta", "5")];
  const decoded = decode([...sent, entry("delete_world", 0, "x", "1"), { plane: "no_changes" }], noTrackers);

  expect(decoded?.calls).toEqual([{ name: "no_changes", arguments: "{}" }]);
  expect(decoded?.unassembled).toEqual([
    {
      name: "set_tracker",
      args: JSON.stringify(sent),
      verdict: "dropped",
      issues: [
        '(tool): this pass offered no tool by that name, so these values were dropped — sent {"plane":"set_tracker","field":"key","value":"gold"}',
        '(tool): this pass offered no tool by that name, so these values were dropped — sent {"plane":"set_tracker","field":"delta","value":"5"}',
      ],
    },
    {
      name: "delete_world",
      args: JSON.stringify([entry("delete_world", 0, "x", "1")]),
      verdict: "dropped",
      issues: ['(tool): this pass offered no tool by that name, so these values were dropped — sent {"plane":"delete_world","field":"x","value":"1"}'],
    },
  ]);
  expect(decoded?.dropped).toEqual(["set_tracker.key", "set_tracker.delta", "delete_world.x"]);
  expect(patchChangesToToolCalls({ changes: [] }, TOOLS)).toBeNull();
});

test("entries that are not a change at all are counted, never guessed at", () => {
  expect(patchChangesToToolCalls({ changes: [null, 5, { plane: 3 }, { plane: "update_scene", call: 0, field: "location" }] }, TOOLS)).toEqual({
    calls: [],
    unassembled: [],
    unreadable: 4,
    dropped: [],
  });
});

const PROJECTED_PATCH_BOUNDS = z.object({
  properties: z.object({
    changes: z.object({
      items: z.object({
        anyOf: z.array(
          z.object({ properties: z.object({ call: z.record(z.string(), z.unknown()).optional(), item: z.record(z.string(), z.unknown()).optional() }) }),
        ),
      }),
    }),
  }),
});

test("call and item ids are bounded whole numbers: the schema says so, and an out-of-range id is a recorded DROP naming which id", () => {
  const projected = projectJsonSchema(stateRoundPatchSchema(TOOLS));
  const member = PROJECTED_PATCH_BOUNDS.parse(projected).properties.changes.items.anyOf[0];
  expect(member?.properties.call).toMatchObject({ type: "integer", minimum: 0, maximum: RPG_PATCH_INDEX_MAX });
  expect(member?.properties.item).toMatchObject({ type: "integer", minimum: 0, maximum: RPG_PATCH_INDEX_MAX });

  const outOfRange = [
    // `1e400` is what a JSON reply's out-of-range number parses to: Infinity.
    entry("update_scene", Number.POSITIVE_INFINITY, "location", "inf"),
    entry("update_scene", -1, "location", "neg"),
    entry("update_scene", 0.5, "day", "2"),
    entry("update_scene", RPG_PATCH_INDEX_MAX + 1, "recentEvent", "over"),
    { ...entry("update_scene", 0, "presentUpsert.name", "far"), item: 1e21 },
  ];
  const decoded = decode([...outOfRange, { ...entry("update_scene", RPG_PATCH_INDEX_MAX, "location", "the inn"), item: RPG_PATCH_INDEX_MAX }]);
  const callRange = `expected a whole number from 0 to ${RPG_PATCH_INDEX_MAX}`;

  expect(decoded?.calls).toEqual([{ name: "update_scene", arguments: '{"location":"the inn"}' }]);
  expect(decoded?.unassembled).toEqual([
    {
      name: "update_scene",
      args: JSON.stringify(outOfRange),
      verdict: "dropped",
      issues: [
        `(call): Invalid call: ${callRange}, received Infinity — sent {"field":"location","value":"inf"}`,
        `(call): Invalid call: ${callRange}, received -1 — sent {"field":"location","value":"neg"}`,
        `(call): Invalid call: ${callRange}, received 0.5 — sent {"field":"day","value":"2"}`,
        `(call): Invalid call: ${callRange}, received ${RPG_PATCH_INDEX_MAX + 1} — sent {"field":"recentEvent","value":"over"}`,
        `(item): Invalid item: ${callRange}, received 1e+21 — sent {"field":"presentUpsert.name","value":"far"}`,
      ],
    },
  ]);
});

// ── the prompt's field teaching ─────────────────────────────────────────────────────────────────────────────────

test("a per-actor split teaches every actor's values, each with the actor it belongs to — no branch's values drop out", () => {
  const party = (refs: ExtractionRefs): RpgStateRoundTool => roundTools(refs)[0] as RpgStateRoundTool;
  const mixed = roundTools({
    ...REFS,
    trackerWriteGroups: [
      { targetRefs: ["Mira"], deltaKeys: ["hp"], setKeys: [] },
      { targetRefs: ["Corvin"], deltaKeys: [], setKeys: ["mood"] },
    ],
  })[0] as RpgStateRoundTool;

  expect(describePatchFields(party(SPLIT_REFS))).toEqual([
    "targetRef (one of Mira | Corvin)",
    "trackerDeltas.key (hp for Mira, mana for Corvin)",
    "trackerDeltas.delta (number)",
    "addCondition.name",
    "addCondition.modifier (number)",
    "removeCondition (one of Bleeding)",
    "status",
  ]);
  expect(describePatchFields(mixed)).toEqual(
    expect.arrayContaining([
      "targetRef (one of Mira | Corvin)",
      "trackerDeltas.key (hp for Mira)",
      "trackerDeltas.delta (number for Mira)",
      "trackerSets.key (mood for Corvin)",
      "trackerSets.items (for Corvin)",
    ]),
  );
  // An unsplit tool reads exactly as before.
  expect(describePatchFields(party(REFS))).toContain("targetRef (one of Mira | Corvin)");
});

// ── several update_scene calls in one round: the shared fold keeps every call, in order ─────────────────────────
// What they leave on the state is pinned against applying the calls one by one in the domain's apply suite.

const sceneCall = (args: Record<string, unknown>): RpgToolCall => ({ name: "update_scene", arguments: JSON.stringify(args) });

test("a structured reply that splits one scene update across calls keeps every call, not just the last", () => {
  const decoded = decode([
    entry("update_scene", 0, "location", "the inn"),
    entry("update_scene", 1, "timeOfDay", "evening"),
    entry("update_scene", 2, "plot.title", "The Long Night"),
    entry("update_scene", 2, "recentEvent", "Mira lit the lamps."),
  ]);

  const extraction = toolCallsToExtraction(decoded?.calls ?? []);
  expect(extraction.scene).toEqual({ location: "the inn" });
  expect(extraction.sceneFollowUps).toEqual([{ timeOfDay: "evening" }, { plot: { title: "The Long Night" }, recentEvent: "Mira lit the lamps." }]);
  expect(recordToolCalls(decoded?.calls ?? []).map((call) => call.verdict)).toEqual(["applied", "applied", "applied"]);
  // One scene call stays exactly the old shape.
  expect(toolCallsToExtraction([sceneCall({ location: "the inn" })])).not.toHaveProperty("sceneFollowUps");
});

test("a scene value restated differently by a later call is recorded on the earlier call; beats and presence never are", () => {
  const calls = [
    sceneCall({ location: "the inn", timeOfDay: "evening", recentEvent: "A happened", presentRemove: ["Vesna"] }),
    sceneCall({ location: "the road", timeOfDay: "evening", weather: { type: "rain", label: "drizzle" }, recentEvent: "B happened" }),
    sceneCall({ weather: { type: "rain" }, presentUpsert: [{ name: "Vesna" }] }),
  ];

  const record = recordToolCalls(calls);
  expect(record.map((call) => call.verdict)).toEqual(["salvaged", "salvaged", "applied"]);
  // The path half is schema words; the replaced value rides the sent half. Restating the same value is no conflict,
  // and weather is written whole, so dropping its label replaces it.
  expect(record[0]?.issues).toEqual([expect.stringMatching(/^location: .* — sent "the inn"$/u)]);
  expect(record[1]?.issues).toEqual([expect.stringMatching(/^weather: .* — sent \{"type":"rain","label":"drizzle"\}$/u)]);
});

test("two upserts of one actor that differ record the replaced value, naming the actor only in the sent half", () => {
  const calls = [
    sceneCall({ presentUpsert: [{ name: "Mira", mood: "wary", relationship: { kind: "ally" } }] }),
    sceneCall({
      presentUpsert: [
        { name: "Mira", mood: "warm", relationship: { kind: "ally" } },
        { name: "Oren", mood: "wary" },
      ],
    }),
  ];

  const record = recordToolCalls(calls);
  expect(record.map((call) => call.verdict)).toEqual(["salvaged", "applied"]);
  expect(record[0]?.issues).toEqual([
    'presentUpsert.mood: a later update_scene this turn set this field again, so this value was replaced — sent {"name":"Mira","mood":"wary"}',
  ]);
});
