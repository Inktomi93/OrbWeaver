// @orb/contracts/rpg structured-round — a structured state reply decodes to the SAME tool calls a tool round
// returns, so both vehicles share one fold. Pinned: entries keep their order and their args' string encoding, a
// strict-compatible `null` means "omitted", a reply that is not a non-empty `changes` list is refused whole, and an
// entry with no tool name is counted rather than guessed at.

import type { RpgToolCall } from "@orb/contracts/rpg";
import { patchChangesToToolCalls, RPG_STATE_TOOL_ARGS, stateRoundPatchSchema, structuredChangesToToolCalls, toolCallsToExtraction } from "@orb/contracts/rpg";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { z } from "zod";
import { expect, test } from "../../support/fixtures.ts";

test("a multi-change reply decodes to the tool calls a tool round carries, and folds identically", () => {
  const reply = {
    changes: [
      { tool: "update_scene", args: { location: "the cave", weather: null } },
      { tool: "add_journal_entry", args: { type: "location", title: "Into the cave", content: "They fled the chapel." } },
    ],
  };
  const sameCallsAsTools: RpgToolCall[] = [
    { name: "update_scene", arguments: JSON.stringify({ location: "the cave" }) },
    { name: "add_journal_entry", arguments: JSON.stringify({ type: "location", title: "Into the cave", content: "They fled the chapel." }) },
  ];

  const decoded = structuredChangesToToolCalls(reply);

  expect(decoded).toEqual({ calls: sameCallsAsTools, unreadable: 0, dropped: [] });
  expect(toolCallsToExtraction(decoded?.calls ?? [])).toEqual(toolCallsToExtraction(sameCallsAsTools));
});

test("a reply that is not a non-empty `changes` list is refused whole", () => {
  for (const reply of [null, "text", [], {}, { changes: [] }, { changes: "update_scene" }]) {
    expect(structuredChangesToToolCalls(reply), JSON.stringify(reply)).toBeNull();
  }
});

test("an entry with no tool name is counted, and every other entry still decodes", () => {
  const decoded = structuredChangesToToolCalls({ changes: [{ args: { location: "x" } }, "update_scene", { tool: "no_changes", args: {} }] });

  expect(decoded).toEqual({ calls: [{ name: "no_changes", arguments: "{}" }], unreadable: 2, dropped: [] });
});

/** The projected patch-list schema, narrowed to the parts this pin reads. */
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

test("the patch-list schema is generated from each tool's own argument names, one member per plane plus `no_changes`", () => {
  const tools = ["update_party", "update_scene", "no_changes"].map((name) => ({ name, description: `${name} help` }));
  const schema = PROJECTED_PATCH.parse(projectJsonSchema(stateRoundPatchSchema(tools)));

  const members = schema.properties.changes.items.anyOf;
  expect(schema.properties.changes.minItems).toBe(1);
  expect(members.map((member) => member.properties["plane"]?.enum)).toEqual([["update_party"], ["update_scene"], ["no_changes"]]);
  expect(members[0]?.properties["field"]?.enum).toEqual(Object.keys(RPG_STATE_TOOL_ARGS.get("update_party")?.shape ?? {}));
  expect(members[1]?.properties["field"]?.enum).toEqual(Object.keys(RPG_STATE_TOOL_ARGS.get("update_scene")?.shape ?? {}));
  expect(members.map((member) => member.required)).toEqual([["plane", "field", "value"], ["plane", "field", "value"], ["plane"]]);
});

test("a patch reply groups one plane's fields into one call, decodes JSON values through the field's schema, and folds like tool calls", () => {
  const decoded = patchChangesToToolCalls({
    changes: [
      { plane: "update_party", field: "targetRef", value: "Mira" },
      { plane: "update_party", field: "addCondition", value: '{"name":"Bleeding"}' },
      { plane: "update_party", field: "targetRef", value: "Corvin" },
      { plane: "update_party", field: "status", value: "smug" },
      { plane: "update_scene", field: "location", value: "the cave" },
      { plane: "update_scene", field: "day", value: "3" },
    ],
  });
  const sameCallsAsTools: RpgToolCall[] = [
    { name: "update_party", arguments: JSON.stringify({ targetRef: "Mira", addCondition: { name: "Bleeding" } }) },
    { name: "update_party", arguments: JSON.stringify({ targetRef: "Corvin", status: "smug" }) },
    { name: "update_scene", arguments: JSON.stringify({ location: "the cave", day: 3 }) },
  ];

  expect(decoded).toEqual({ calls: sameCallsAsTools, unreadable: 0, dropped: [] });
  expect(toolCallsToExtraction(decoded?.calls ?? [])).toEqual(toolCallsToExtraction(sameCallsAsTools));
});

test("a patch value its field's schema refuses is DROPPED by name and never written; the rest of the call stands", () => {
  const decoded = patchChangesToToolCalls({
    changes: [
      { plane: "update_scene", field: "location", value: "the cave" },
      { plane: "update_scene", field: "day", value: "tomorrow" },
      { plane: "update_scene", field: "invented", value: "x" },
      { plane: "no_changes" },
      { field: "location", value: "nowhere" },
    ],
  });

  expect(decoded).toEqual({
    calls: [
      { name: "update_scene", arguments: JSON.stringify({ location: "the cave" }) },
      { name: "no_changes", arguments: "{}" },
    ],
    unreadable: 1,
    dropped: ["update_scene.day", "update_scene.invented"],
  });
  expect(patchChangesToToolCalls({ changes: [] })).toBeNull();
});
