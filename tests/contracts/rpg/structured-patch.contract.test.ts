// @orb/contracts/rpg structured-patch — the PATCH-LIST shape of the structured state round. Pinned: the schema is
// generated from the round's own (constrained) wire tools and carries no optional and no union-typed property on any
// wire; the decoder only assembles each call's raw arguments (shaped by declared type, never parsed as JSON), so a
// patch reply and a tool call with the same intent leave the SAME record, verdict, issues and fold; `(plane, call)`
// groups calls and `item` groups array elements; an entry that cannot form an argument rides its own recorded call.

import { checkWireSchema, structuredSchemaComplexity, WIRE_SCHEMA_MODES } from "@orb/contracts/inference";
import type { ExtractionRefs, RpgStateRoundTool, RpgToolCall } from "@orb/contracts/rpg";
import {
  constrainExtractionSchema,
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

test("a prototype key never reaches a lookup: it rides its own recorded DROP, carried as sent, beside the assembled call", () => {
  const unknown = [entry("update_scene", 0, "constructor", "x"), entry("update_scene", 0, "toString", "x"), entry("update_scene", 0, "__proto__", "x")];
  const decoded = decode([...unknown, entry("update_scene", 0, "location", "the inn")]);

  expect(decoded?.dropped).toEqual(["update_scene.constructor", "update_scene.toString", "update_scene.__proto__"]);
  expect(decoded?.calls).toEqual([
    { name: "update_scene", arguments: '{"location":"the inn"}' },
    { name: "update_scene", arguments: JSON.stringify(unknown) },
  ]);
  expect(recordToolCalls(decoded?.calls ?? []).map((call) => call.verdict)).toEqual(["applied", "dropped"]);
  expect(toolCallsToExtraction(decoded?.calls ?? []).scene).toEqual({ location: "the inn" });
});

test("a repeated scalar is never silently overwritten; an unknown plane is recorded as the tool round records an unknown tool", () => {
  const decoded = decode([
    entry("update_scene", 0, "location", "the inn"),
    entry("update_scene", 0, "location", "the road"),
    entry("delete_world", 0, "x", "1"),
    { plane: "no_changes" },
  ]);

  expect(decoded?.dropped).toEqual(["update_scene.location", "delete_world.x"]);
  expect(argsOf(decoded)).toEqual([
    { name: "update_scene", args: { location: "the inn" } },
    { name: "no_changes", args: {} },
    { name: "update_scene", args: [entry("update_scene", 0, "location", "the road")] },
    { name: "delete_world", args: [entry("delete_world", 0, "x", "1")] },
  ]);
  const record = recordToolCalls(decoded?.calls ?? []);
  expect(record.map((call) => [call.name, call.verdict])).toEqual([
    ["update_scene", "applied"],
    ["no_changes", "applied"],
    ["update_scene", "dropped"],
    ["delete_world", "applied"],
  ]);
  const toolRoundUnknown = { name: "delete_world", arguments: JSON.stringify([entry("delete_world", 0, "x", "1")]) };
  expect(record[3]).toEqual(recordToolCalls([toolRoundUnknown])[0]);
  expect(toolCallsToExtraction(decoded?.calls ?? []).scene).toEqual({ location: "the inn" });
  expect(patchChangesToToolCalls({ changes: [] }, TOOLS)).toBeNull();
});

test("entries that are not a change at all are counted, never guessed at", () => {
  expect(patchChangesToToolCalls({ changes: [null, 5, { plane: 3 }, { plane: "update_scene", call: 0, field: "location" }] }, TOOLS)).toEqual({
    calls: [],
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

test("call and item ids are bounded whole numbers: the schema says so, and an out-of-range id rides its plane's recorded DROP", () => {
  const projected = projectJsonSchema(stateRoundPatchSchema(TOOLS));
  const member = PROJECTED_PATCH_BOUNDS.parse(projected).properties.changes.items.anyOf[0];
  expect(member?.properties.call).toMatchObject({ type: "integer", minimum: 0, maximum: RPG_PATCH_INDEX_MAX });
  expect(member?.properties.item).toMatchObject({ type: "integer", minimum: 0, maximum: RPG_PATCH_INDEX_MAX });

  const outOfRange = [
    // `1e400` is what a JSON reply's out-of-range number parses to: Infinity.
    entry("update_scene", Number.POSITIVE_INFINITY, "location", "inf"),
    entry("update_scene", -1, "location", "neg"),
    entry("update_scene", 0.5, "day", "2"),
    entry("update_scene", 2 ** 53, "recentEvent", "huge"),
    entry("update_scene", RPG_PATCH_INDEX_MAX + 1, "recentEvent", "over"),
    { ...entry("update_scene", 0, "presentUpsert.name", "far"), item: 1e21 },
  ];
  const decoded = decode([...outOfRange, { ...entry("update_scene", RPG_PATCH_INDEX_MAX, "location", "the inn"), item: RPG_PATCH_INDEX_MAX }]);

  expect(decoded?.dropped).toEqual([
    "update_scene.location",
    "update_scene.location",
    "update_scene.day",
    "update_scene.recentEvent",
    "update_scene.recentEvent",
    "update_scene.presentUpsert.name",
  ]);
  expect(decoded?.calls).toEqual([
    { name: "update_scene", arguments: '{"location":"the inn"}' },
    { name: "update_scene", arguments: JSON.stringify(outOfRange) },
  ]);
  const record = recordToolCalls(decoded?.calls ?? []);
  expect(record.map((call) => call.verdict)).toEqual(["applied", "dropped"]);
  expect(record[1]?.args).toBe(JSON.stringify(outOfRange));
});
