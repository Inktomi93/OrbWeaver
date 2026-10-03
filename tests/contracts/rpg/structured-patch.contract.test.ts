// @orb/contracts/rpg structured-patch — the PATCH-LIST shape of the structured state round. Pinned: the schema is
// generated from the round's own (constrained) wire tools and carries no optional and no union-typed property; every
// value is decoded by its field's declared type and per-round enum, never parsed as JSON; `(plane, call)` groups calls
// and `item` groups array elements, so a value can never attach to the wrong entity; a refused value — including a
// prototype key — is dropped by name and never thrown.

import { structuredSchemaComplexity } from "@orb/contracts/inference";
import type { ExtractionRefs, RpgStateRoundTool } from "@orb/contracts/rpg";
import {
  constrainExtractionSchema,
  malformedToolCalls,
  patchChangesToToolCalls,
  patchFieldPaths,
  patchToolsOnlyFields,
  RPG_PATCH_INDEX_MAX,
  recordToolCalls,
  rpgExtractionSchema,
  stateRoundPatchSchema,
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

function decode(changes: readonly Record<string, unknown>[]): ReturnType<typeof patchChangesToToolCalls> {
  return patchChangesToToolCalls({ changes }, TOOLS);
}

function argsOf(decoded: ReturnType<typeof patchChangesToToolCalls>): readonly { readonly name: string; readonly args: unknown }[] {
  return (decoded?.calls ?? []).map((call) => ({ name: call.name, args: JSON.parse(call.arguments) as unknown }));
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

test("a prototype key as a field is DROPPED by name and never reaches a schema lookup", () => {
  const decoded = decode([
    { plane: "update_scene", call: 0, field: "constructor", item: 0, value: "x" },
    { plane: "update_scene", call: 0, field: "toString", item: 0, value: "x" },
    { plane: "update_scene", call: 0, field: "__proto__", item: 0, value: "x" },
    { plane: "update_scene", call: 0, field: "location", item: 0, value: "the inn" },
  ]);

  expect(decoded?.dropped).toEqual(["update_scene.constructor", "update_scene.toString", "update_scene.__proto__"]);
  expect(argsOf(decoded)).toEqual([{ name: "update_scene", args: { location: "the inn" } }]);
});

test("two journal entries stay two calls: `call` groups, so the second title never lands on the first entry", () => {
  const decoded = decode([
    { plane: "add_journal_entry", call: 0, field: "type", item: 0, value: "combat" },
    { plane: "add_journal_entry", call: 0, field: "content", item: 0, value: "Corvin wounds Mira." },
    { plane: "add_journal_entry", call: 1, field: "title", item: 0, value: "The cave" },
    { plane: "add_journal_entry", call: 1, field: "content", item: 0, value: "They reach the cave." },
  ]);

  expect(argsOf(decoded)).toEqual([
    { name: "add_journal_entry", args: { type: "combat", content: "Corvin wounds Mira." } },
    { name: "add_journal_entry", args: { title: "The cave", content: "They reach the cave." } },
  ]);
});

test("two actors stay two update_party calls, each with its own condition and status, whatever order the fields come in", () => {
  const decoded = decode([
    { plane: "update_party", call: 0, field: "status", item: 0, value: "wounded" },
    { plane: "update_party", call: 1, field: "targetRef", item: 0, value: "Corvin" },
    { plane: "update_party", call: 0, field: "targetRef", item: 0, value: "Mira" },
    { plane: "update_party", call: 0, field: "addCondition.name", item: 0, value: "Bleeding" },
    { plane: "update_party", call: 1, field: "removeCondition", item: 0, value: "Bleeding" },
    { plane: "update_party", call: 1, field: "status", item: 0, value: "grim" },
  ]);

  expect(argsOf(decoded)).toEqual([
    { name: "update_party", args: { status: "wounded", targetRef: "Mira", addCondition: { name: "Bleeding" } } },
    { name: "update_party", args: { targetRef: "Corvin", removeCondition: "Bleeding", status: "grim" } },
  ]);
});

test("values decode by declared type: digits for numbers, words from the enum, text verbatim — never JSON", () => {
  const decoded = decode([
    { plane: "update_scene", call: 0, field: "day", item: 0, value: "3" },
    { plane: "update_scene", call: 0, field: "plot.act", item: 0, value: "two" },
    { plane: "update_scene", call: 0, field: "timeOfDay", item: 0, value: "dusk" },
    { plane: "update_scene", call: 0, field: "weather.type", item: 0, value: "rain" },
    { plane: "update_scene", call: 0, field: "location", item: 0, value: '{"a":1}' },
    { plane: "update_inventory", call: 0, field: "targetRef", item: 0, value: "Mira" },
    { plane: "update_inventory", call: 0, field: "add.name", item: 0, value: "rope" },
    { plane: "update_inventory", call: 0, field: "add.quantity", item: 0, value: "1.5" },
    { plane: "update_inventory", call: 0, field: "walletDeltas.delta", item: 0, value: "[5]" },
  ]);

  expect(argsOf(decoded)).toEqual([
    { name: "update_scene", args: { day: 3, weather: { type: "rain" }, location: '{"a":1}' } },
    { name: "update_inventory", args: { targetRef: "Mira", add: [{ name: "rope" }] } },
  ]);
  expect(decoded?.dropped).toEqual(["update_scene.plot.act", "update_scene.timeOfDay", "update_inventory.add.quantity", "update_inventory.walletDeltas.delta"]);
});

test('a number|string field prefers the number, so `"5"` lands as 5 and folds exactly like the tool call that sent 5', () => {
  const decoded = decode([
    { plane: "set_tracker", call: 0, field: "key", item: 0, value: "omen" },
    { plane: "set_tracker", call: 0, field: "value", item: 0, value: "5" },
    { plane: "set_tracker", call: 1, field: "key", item: 0, value: "omen" },
    { plane: "set_tracker", call: 1, field: "value", item: 0, value: "crows at dawn" },
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
    { plane: "update_scene", call: 0, field: "presentRemove", item: 0, value: "Corvin" },
    { plane: "update_scene", call: 0, field: "presentRemove", item: 0, value: "Mira" },
    { plane: "update_scene", call: 0, field: "presentUpsert.name", item: 1, value: "Vesna" },
    { plane: "update_scene", call: 0, field: "presentUpsert.name", item: 0, value: "Oren" },
    { plane: "update_scene", call: 0, field: "presentUpsert.relationship.kind", item: 1, value: "ally" },
    { plane: "update_scene", call: 0, field: "presentUpsert.mood", item: 0, value: "wary" },
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

test("a boolean field takes only `true` or `false`", () => {
  const toggles: RpgStateRoundTool = { name: "toggle", description: "", parameters: { type: "object", properties: { lit: { type: "boolean" } } } };

  const decoded = patchChangesToToolCalls(
    {
      changes: [
        { plane: "toggle", call: 0, field: "lit", item: 0, value: "true" },
        { plane: "toggle", call: 1, field: "lit", item: 0, value: "yes" },
      ],
    },
    [toggles],
  );

  expect(argsOf(decoded)).toEqual([
    { name: "toggle", args: { lit: true } },
    { name: "toggle", args: {} },
  ]);
  expect(decoded?.dropped).toEqual(["toggle.lit"]);
});

test("the round's per-call enums bind at decode: a target, a condition or a tracker key outside them is DROPPED by name", () => {
  const decoded = decode([
    { plane: "update_party", call: 0, field: "targetRef", item: 0, value: "Nobody" },
    { plane: "update_party", call: 0, field: "removeCondition", item: 0, value: "Poisoned" },
    { plane: "update_party", call: 0, field: "status", item: 0, value: "lost" },
    { plane: "set_tracker", call: 0, field: "key", item: 0, value: "invented" },
    { plane: "set_tracker", call: 0, field: "delta", item: 0, value: "2" },
  ]);

  expect(decoded?.dropped).toEqual(["update_party.targetRef", "update_party.removeCondition", "set_tracker.key"]);
  expect(argsOf(decoded)).toEqual([
    { name: "update_party", args: { status: "lost" } },
    { name: "set_tracker", args: { delta: 2 } },
  ]);
});

test("a per-actor tracker split keeps each key on the actor who carries it", () => {
  const tools = roundTools({
    ...REFS,
    trackerWriteGroups: [
      { targetRefs: ["Mira"], deltaKeys: ["hp"], setKeys: [] },
      { targetRefs: ["Corvin"], deltaKeys: ["mana"], setKeys: [] },
    ],
  });
  const decoded = patchChangesToToolCalls(
    {
      changes: [
        { plane: "update_party", call: 0, field: "targetRef", item: 0, value: "Corvin" },
        { plane: "update_party", call: 0, field: "trackerDeltas.key", item: 0, value: "mana" },
        { plane: "update_party", call: 0, field: "trackerDeltas.delta", item: 0, value: "-2" },
        { plane: "update_party", call: 1, field: "targetRef", item: 0, value: "Corvin" },
        { plane: "update_party", call: 1, field: "trackerDeltas.key", item: 0, value: "hp" },
      ],
    },
    tools,
  );

  const calls = argsOf(decoded);
  expect(calls[0]).toEqual({ name: "update_party", args: { targetRef: "Corvin", trackerDeltas: [{ key: "mana", delta: -2 }] } });
  // Corvin carries no hp: whichever half survives, hp is never written onto him.
  expect(JSON.stringify(calls[1]?.args)).not.toMatch(/Corvin.*hp|hp.*Corvin/u);
  expect(decoded?.dropped).toHaveLength(1);
});

test("a repeated scalar in one call is refused, never silently overwritten; an unknown plane is dropped whole", () => {
  const decoded = decode([
    { plane: "update_scene", call: 0, field: "location", item: 0, value: "the inn" },
    { plane: "update_scene", call: 0, field: "location", item: 0, value: "the road" },
    { plane: "delete_world", call: 0, field: "x", item: 0, value: "1" },
    { plane: "no_changes" },
  ]);

  expect(argsOf(decoded)).toEqual([
    { name: "update_scene", args: { location: "the inn" } },
    { name: "delete_world", args: {} },
    { name: "no_changes", args: {} },
  ]);
  expect(decoded?.dropped).toEqual(["update_scene.location", "delete_world.x"]);
  // The unknown plane is a recorded drop naming what was sent, never a silent no-op.
  expect(recordToolCalls(decoded?.calls ?? []).map((call) => [call.name, call.verdict])).toEqual([
    ["update_scene", "salvaged"],
    ["delete_world", "dropped"],
    ["no_changes", "applied"],
  ]);
  expect(patchChangesToToolCalls({ changes: [] }, TOOLS)).toBeNull();
});

// ── round 2: the patch vehicle's refusals reach the same record the tool round writes ──────────────────────────

/** The disclosure a call set produces: verdict and issues per call, the parts a reader sees. */
function disclosure(calls: readonly { readonly name: string; readonly arguments: string }[]): readonly unknown[] {
  return recordToolCalls(calls).map((call) => ({ name: call.name, verdict: call.verdict, issues: call.issues }));
}

test("a partly refused patch call discloses exactly what the tool round discloses for the same intent: salvaged, naming the field", () => {
  const patch = decode([
    { plane: "update_scene", call: 0, field: "location", item: 0, value: "the inn" },
    { plane: "update_scene", call: 0, field: "timeOfDay", item: 0, value: "Evening" },
  ]);
  const toolRound = [{ name: "update_scene", arguments: JSON.stringify({ location: "the inn", timeOfDay: "Evening" }) }];

  expect(disclosure(patch?.calls ?? [])).toEqual(disclosure(toolRound));
  expect(disclosure(toolRound)).toEqual([{ name: "update_scene", verdict: "salvaged", issues: ["update_scene.timeOfDay"] }]);
  expect(toolCallsToExtraction(patch?.calls ?? [])).toEqual(toolCallsToExtraction(toolRound));
});

test("a wholly refused patch call is a recorded DROP naming the field and the value sent — exactly the tool round's line, never a quiet beat", () => {
  const patch = decode([{ plane: "update_scene", call: 0, field: "timeOfDay", item: 0, value: "Evening" }]);
  const toolRound = [{ name: "update_scene", arguments: JSON.stringify({ timeOfDay: "Evening" }) }];

  expect(disclosure(patch?.calls ?? [])).toEqual(disclosure(toolRound));
  expect(recordToolCalls(patch?.calls ?? [])[0]?.verdict).toBe("dropped");
  expect(recordToolCalls(patch?.calls ?? [])[0]?.issues[0]).toMatch(/^timeOfDay: .* — sent "Evening"$/u);
  // It writes nothing, and it is not a usable call (so a downgraded round would still be retried).
  expect(toolCallsToExtraction(patch?.calls ?? []).scene).toBeUndefined();
  expect(malformedToolCalls(patch?.calls ?? [])).toEqual(["update_scene"]);
});

test("a tie between per-actor branches keeps the actor the model named, and the record never claims it sent nothing", () => {
  const tools = roundTools({
    ...REFS,
    trackerWriteGroups: [
      { targetRefs: ["Mira"], deltaKeys: ["hp"], setKeys: [] },
      { targetRefs: ["Corvin"], deltaKeys: ["mana"], setKeys: [] },
    ],
  });
  const entries = [
    { plane: "update_party", call: 0, field: "targetRef", item: 0, value: "Corvin" },
    { plane: "update_party", call: 0, field: "trackerDeltas.key", item: 0, value: "hp" },
    { plane: "update_party", call: 0, field: "trackerDeltas.delta", item: 0, value: "-2" },
    { plane: "update_party", call: 0, field: "status", item: 0, value: "bloodied" },
  ];
  for (const changes of [entries, [...entries].reverse()]) {
    const decoded = patchChangesToToolCalls({ changes }, tools);
    const [record] = recordToolCalls(decoded?.calls ?? []);

    expect(JSON.parse(decoded?.calls[0]?.arguments ?? "{}")).toMatchObject({ targetRef: "Corvin", status: "bloodied" });
    expect(decoded?.calls[0]?.refused).toEqual([expect.objectContaining({ field: "trackerDeltas.key", sent: "hp" })]);
    expect(record?.verdict).toBe("salvaged");
    expect(record?.issues).toContain("update_party.trackerDeltas.key");
    expect(JSON.stringify(record?.issues)).not.toContain("(absent)");
    expect(toolCallsToExtraction(decoded?.calls ?? []).party).toEqual([{ targetRef: "Corvin", status: "bloodied" }]);
  }
});

test("call and item ids are bounded whole numbers: the schema says so, and an out-of-range id is refused by name", () => {
  const projected = projectJsonSchema(stateRoundPatchSchema(TOOLS));
  const member = PROJECTED_PATCH_BOUNDS.parse(projected).properties.changes.items.anyOf[0];
  expect(member?.properties.call).toMatchObject({ type: "integer", minimum: 0, maximum: RPG_PATCH_INDEX_MAX });
  expect(member?.properties.item).toMatchObject({ type: "integer", minimum: 0, maximum: RPG_PATCH_INDEX_MAX });
  expect(structuredSchemaComplexity(projected)).toEqual({ optionalProps: 0, unionProps: 0 });

  const decoded = patchChangesToToolCalls(
    {
      changes: [
        // `1e400` is what a JSON reply's out-of-range number parses to: Infinity.
        { plane: "update_scene", call: Number.POSITIVE_INFINITY, field: "location", item: 0, value: "inf" },
        { plane: "update_scene", call: -1, field: "location", item: 0, value: "neg" },
        { plane: "update_scene", call: 0.5, field: "day", item: 0, value: "2" },
        { plane: "update_scene", call: 2 ** 53, field: "recentEvent", item: 0, value: "huge" },
        { plane: "update_scene", call: 0, field: "presentUpsert.name", item: 1e21, value: "far" },
        { plane: "update_scene", call: 0, field: "location", item: 0, value: "the inn" },
      ],
    },
    TOOLS,
  );

  expect(decoded?.dropped).toEqual([
    "update_scene.location",
    "update_scene.location",
    "update_scene.day",
    "update_scene.recentEvent",
    "update_scene.presentUpsert.name",
  ]);
  expect(argsOf(decoded)).toEqual([
    { name: "update_scene", args: {} },
    { name: "update_scene", args: { location: "the inn" } },
  ]);
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
