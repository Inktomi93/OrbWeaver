import { checkWireSchema, countWireSchemas, effectiveStructuredLimits, WIRE_SCHEMA_MODES } from "@orb/contracts/inference";
import type {
  AddJournalEntryArgs,
  ExtractionRefs,
  RpgToolName,
  SetTrackerArgs,
  UpdateInventoryArgs,
  UpdatePartyArgs,
  UpdateSceneArgs,
  UpsertQuestArgs,
} from "@orb/contracts/rpg";
import {
  buildToolRoundWireTools,
  patchChangesToToolCalls,
  RPG_NO_CHANGES_TOOL,
  RPG_TOOL_ROUND_TOOL_NAMES,
  recordToolCalls,
  rpgGameConfigSchema,
  stateRoundPatchSchema,
  toolCallsToExtraction,
} from "@orb/contracts/rpg";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { z } from "zod";

const MIRA = "Mira";
const CORVIN = "Corvin";
const FLAT_REFS: ExtractionRefs = {
  actorRefs: [MIRA, CORVIN],
  trackerWriteGroups: [{ targetRefs: [MIRA, CORVIN], deltaKeys: ["hp"], setKeys: ["mood"] }],
  gameTrackerKeys: { deltaKeys: ["gold"], setKeys: ["omen"] },
  conditionNames: ["Poisoned"],
  establishScene: { location: false, timeOfDay: false, presentCast: false },
};
const SPLIT_REFS: ExtractionRefs = {
  ...FLAT_REFS,
  trackerWriteGroups: [
    { targetRefs: [MIRA], deltaKeys: ["hp"], setKeys: ["mood"] },
    { targetRefs: [CORVIN], deltaKeys: ["mana"], setKeys: ["focus"] },
  ],
};
const CONFIG = rpgGameConfigSchema.parse({});

// Required is deliberately applied at every owned nesting level: a new optional field must gain an example.
const PARTY_ARGS = {
  targetRef: MIRA,
  trackerDeltas: [{ key: "hp", delta: -2 } satisfies Required<NonNullable<UpdatePartyArgs["trackerDeltas"]>[number]>],
  trackerSets: [{ key: "mood", value: "wary", items: ["rope", "torch"] } satisfies Required<NonNullable<UpdatePartyArgs["trackerSets"]>[number]>],
  addCondition: { name: "Bleeding", modifier: -1 } satisfies Required<NonNullable<UpdatePartyArgs["addCondition"]>>,
  removeCondition: "Poisoned",
  status: "wounded",
} satisfies Required<UpdatePartyArgs>;

const INVENTORY_ARGS = {
  targetRef: MIRA,
  add: [{ name: "rope", description: "braided", quantity: 2, location: "pack" } satisfies Required<NonNullable<UpdateInventoryArgs["add"]>[number]>],
  update: [{ name: "key", description: "brass", quantity: 1, location: "belt" } satisfies Required<NonNullable<UpdateInventoryArgs["update"]>[number]>],
  remove: [{ name: "coin", quantity: 3 } satisfies Required<NonNullable<UpdateInventoryArgs["remove"]>[number]>],
  walletDeltas: [{ name: "gold", delta: 5 } satisfies Required<NonNullable<UpdateInventoryArgs["walletDeltas"]>[number]>],
} satisfies Required<UpdateInventoryArgs>;

const PRESENT_ACTOR = {
  name: "Oren",
  emoji: "🗝️",
  mood: "wary",
  appearance: "scarred",
  outfit: "travel cloak",
  thoughts: "find shelter",
  relationship: { kind: "ally", label: "" } satisfies Required<NonNullable<NonNullable<UpdateSceneArgs["presentUpsert"]>[number]["relationship"]>>,
} satisfies Required<NonNullable<UpdateSceneArgs["presentUpsert"]>[number]>;

const SCENE_ARGS = {
  location: "the inn",
  calendarDate: "Spring 3",
  day: 3,
  timeOfDay: "evening",
  weather: { type: "rain", label: "cold rain" } satisfies Required<NonNullable<UpdateSceneArgs["weather"]>>,
  presentUpsert: [PRESENT_ACTOR, { ...PRESENT_ACTOR, name: "Vesna", mood: "warm" }],
  presentRemove: [MIRA, CORVIN],
  recentEvent: "The lamps were lit.",
  plot: { act: 2, title: "The Long Night", actTitle: "The inn", actSummary: "They found shelter." } satisfies Required<NonNullable<UpdateSceneArgs["plot"]>>,
} satisfies Required<UpdateSceneArgs>;

const TRACKER_ARGS = { key: "omen", delta: -1, value: "watchful", items: ["crows", "bells"] } satisfies Required<SetTrackerArgs>;
const QUEST_ARGS = {
  name: "The gate",
  action: "update",
  description: "Open the eastern gate.",
  objectives: ["Find key", "Open gate"],
  completeObjectives: ["Find key"],
} satisfies Required<UpsertQuestArgs>;
const JOURNAL_ARGS = { type: "custom", label: "omen", title: "Bells", content: "Bells rang in the mist." } satisfies Required<AddJournalEntryArgs>;

const EXAMPLES = [
  {
    tool: "update_party" satisfies RpgToolName,
    args: PARTY_ARGS,
    fields: [
      ["targetRef", MIRA],
      ["trackerDeltas.key", "hp"],
      ["trackerDeltas.delta", "-2"],
      ["trackerSets.key", "mood"],
      ["trackerSets.value", "wary"],
      ["trackerSets.items", "rope"],
      ["trackerSets.items", "torch"],
      ["addCondition.name", "Bleeding"],
      ["addCondition.modifier", "-1"],
      ["removeCondition", "Poisoned"],
      ["status", "wounded"],
    ],
  },
  {
    tool: "update_inventory" satisfies RpgToolName,
    args: INVENTORY_ARGS,
    fields: [
      ["targetRef", MIRA],
      ["add.name", "rope"],
      ["add.description", "braided"],
      ["add.quantity", "2"],
      ["add.location", "pack"],
      ["update.name", "key"],
      ["update.description", "brass"],
      ["update.quantity", "1"],
      ["update.location", "belt"],
      ["remove.name", "coin"],
      ["remove.quantity", "3"],
      ["walletDeltas.name", "gold"],
      ["walletDeltas.delta", "5"],
    ],
  },
  {
    tool: "update_scene" satisfies RpgToolName,
    args: SCENE_ARGS,
    fields: [
      ["location", "the inn"],
      ["calendarDate", "Spring 3"],
      ["day", "3"],
      ["timeOfDay", "evening"],
      ["weather.type", "rain"],
      ["weather.label", "cold rain"],
      ["presentUpsert.name", "Vesna", 1],
      ["presentUpsert.name", "Oren", 0],
      ["presentUpsert.emoji", "🗝️", 1],
      ["presentUpsert.emoji", "🗝️", 0],
      ["presentUpsert.mood", "warm", 1],
      ["presentUpsert.mood", "wary", 0],
      ["presentUpsert.appearance", "scarred", 1],
      ["presentUpsert.appearance", "scarred", 0],
      ["presentUpsert.outfit", "travel cloak", 1],
      ["presentUpsert.outfit", "travel cloak", 0],
      ["presentUpsert.thoughts", "find shelter", 1],
      ["presentUpsert.thoughts", "find shelter", 0],
      ["presentUpsert.relationship.kind", "ally", 1],
      ["presentUpsert.relationship.kind", "ally", 0],
      ["presentUpsert.relationship.label", "", 1],
      ["presentUpsert.relationship.label", "", 0],
      ["presentRemove", MIRA],
      ["presentRemove", CORVIN],
      ["recentEvent", "The lamps were lit."],
      ["plot.act", "2"],
      ["plot.title", "The Long Night"],
      ["plot.actTitle", "The inn"],
      ["plot.actSummary", "They found shelter."],
    ],
  },
  {
    tool: "set_tracker" satisfies RpgToolName,
    args: TRACKER_ARGS,
    fields: [
      ["key", "omen"],
      ["delta", "-1"],
      ["value", "watchful"],
      ["items", "crows"],
      ["items", "bells"],
    ],
  },
  {
    tool: "upsert_quest" satisfies RpgToolName,
    args: QUEST_ARGS,
    fields: [
      ["name", "The gate"],
      ["action", "update"],
      ["description", "Open the eastern gate."],
      ["objectives", "Find key"],
      ["objectives", "Open gate"],
      ["completeObjectives", "Find key"],
    ],
  },
  {
    tool: "add_journal_entry" satisfies RpgToolName,
    args: JOURNAL_ARGS,
    fields: [
      ["type", "custom"],
      ["label", "omen"],
      ["title", "Bells"],
      ["content", "Bells rang in the mist."],
    ],
  },
] as const;

type Example = (typeof EXAMPLES)[number];
type ValueChange = Extract<z.output<ReturnType<typeof stateRoundPatchSchema>>["changes"][number], { field: string }>;

function changesFor(example: Example, call = 0): ValueChange[] {
  return example.fields.map(([field, value, item = 0]) => ({ plane: example.tool, call, field, item, value }));
}

const PATCH_PROJECTION = z.object({
  properties: z.object({
    changes: z.object({
      minItems: z.number(),
      items: z.object({
        anyOf: z.array(
          z.object({
            properties: z.object({ plane: z.object({ enum: z.array(z.string()) }), field: z.object({ enum: z.array(z.string()) }).optional() }),
            required: z.array(z.string()),
          }),
        ),
      }),
    }),
  }),
});

test.for([
  { name: "flat", refs: FLAT_REFS },
  { name: "split", refs: SPLIT_REFS },
])("$name real tools expose every canonical field and decode the complete intended arguments", ({ refs }) => {
  const tools = buildToolRoundWireTools(refs, CONFIG, {});
  const schema = stateRoundPatchSchema(tools);
  const projection = PATCH_PROJECTION.parse(projectJsonSchema(schema));
  const members = projection.properties.changes.items.anyOf;
  expect(tools.map((tool) => tool.name)).toEqual(RPG_TOOL_ROUND_TOOL_NAMES);
  expect(members.map((member) => member.properties.plane.enum[0])).toEqual([...EXAMPLES.map((example) => example.tool), RPG_NO_CHANGES_TOOL]);
  expect(projection.properties.changes.minItems).toBe(1);

  for (const example of EXAMPLES) {
    const member = members.find((candidate) => candidate.properties.plane.enum[0] === example.tool);
    expect(member?.properties.field?.enum).toEqual([...new Set(example.fields.map(([field]) => field))]);
    expect(member?.required).toEqual(["plane", "call", "field", "item", "value"]);
    const reply = schema.parse({ changes: changesFor(example) });
    const decoded = patchChangesToToolCalls(reply, tools);
    expect(decoded).not.toBeNull();
    expect(decoded?.dropped).toEqual([]);
    expect(decoded?.unassembled).toEqual([]);
    expect(decoded?.unreadable).toBe(0);
    expect(decoded?.calls.map((call) => ({ name: call.name, args: JSON.parse(call.arguments) }))).toEqual([{ name: example.tool, args: example.args }]);
    const expectedCalls = [{ name: example.tool, arguments: JSON.stringify(example.args) }];
    expect(recordToolCalls(decoded?.calls ?? [])).toEqual(recordToolCalls(expectedCalls));
    expect(recordToolCalls(decoded?.calls ?? []).map((call) => call.verdict)).toEqual(["applied"]);
    expect(toolCallsToExtraction(decoded?.calls ?? [])).toEqual(toolCallsToExtraction(expectedCalls));
  }
  const quiet = schema.parse({ changes: [{ plane: RPG_NO_CHANGES_TOOL }] });
  expect(patchChangesToToolCalls(quiet, tools)).toEqual({
    calls: [{ name: RPG_NO_CHANGES_TOOL, arguments: "{}" }],
    unassembled: [],
    unreadable: 0,
    dropped: [],
  });
});

test("call identity keeps two complete journal entries separate while the generated envelope refuses widened changes", () => {
  const tools = buildToolRoundWireTools(FLAT_REFS, CONFIG, {});
  const schema = stateRoundPatchSchema(tools);
  const journal = EXAMPLES[5];
  const second = changesFor(journal, 1).map((entry) => (entry.field === "title" ? { ...entry, value: "The cave" } : entry));
  const reply = schema.parse({ changes: [...changesFor(journal), ...second] });
  const decoded = patchChangesToToolCalls(reply, tools);
  expect(decoded?.calls.map((call) => JSON.parse(call.arguments))).toEqual([JOURNAL_ARGS, { ...JOURNAL_ARGS, title: "The cave" }]);
  expect(decoded?.unassembled).toEqual([]);
  const [valid] = changesFor(journal);
  expect(valid).toBeDefined();
  for (const changes of [
    [],
    [{ ...valid, plane: "foreign" }],
    [{ ...valid, field: "foreign" }],
    [{ ...valid, extra: true }],
    [{ plane: RPG_NO_CHANGES_TOOL, value: "foreign" }],
  ]) {
    expect(schema.safeParse({ changes }).success).toBe(false);
  }
});

test.for([
  { name: "flat", refs: FLAT_REFS },
  { name: "split", refs: SPLIT_REFS },
])("$name patch has exact zero optional/union property weight before and after every wire scrub", ({ refs }) => {
  const patch = projectJsonSchema(stateRoundPatchSchema(buildToolRoundWireTools(refs, CONFIG, {})));
  const zero = { maxOptionalProps: 0, maxUnionProps: 0 };
  for (const mode of WIRE_SCHEMA_MODES) {
    expect(countWireSchemas([patch], { mode, limits: zero, strictTools: 0 })).toEqual([]);
    for (const limitsFrom of WIRE_SCHEMA_MODES) {
      const checked = checkWireSchema([patch], mode, { ...effectiveStructuredLimits(limitsFrom, undefined), ...zero });
      expect(checked.violations, mode + " under " + limitsFrom).toEqual([]);
      expect(checked.fits).toBe(true);
    }
  }
});

test("zero property budgets distinguish an all-required scalar from an optional property and a required scalar union", () => {
  const zero = { maxOptionalProps: 0, maxUnionProps: 0 };
  const scalar = projectJsonSchema(z.strictObject({ value: z.string() }));
  const optional = projectJsonSchema(z.strictObject({ value: z.string().optional() }));
  const union = projectJsonSchema(z.strictObject({ value: z.union([z.string(), z.number()]) }));
  const mode = "strict-compatible";
  expect(countWireSchemas([scalar], { mode, limits: zero, strictTools: 0 })).toEqual([]);
  expect(countWireSchemas([optional], { mode, limits: zero, strictTools: 0 })).toEqual([{ kind: "optional-props", mode, count: 1, limit: 0 }]);
  expect(countWireSchemas([union], { mode, limits: zero, strictTools: 0 })).toEqual([{ kind: "union-props", mode, count: 1, limit: 0 }]);
  expect(checkWireSchema([scalar], mode, zero).fits).toBe(true);
  expect(checkWireSchema([optional], mode, zero).violations).toEqual([{ kind: "union-props", mode, count: 1, limit: 0 }]);
  expect(checkWireSchema([union], mode, zero).violations).toEqual([{ kind: "union-props", mode, count: 1, limit: 0 }]);
});
