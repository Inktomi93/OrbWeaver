// @orb/contracts/rpg structured-round — a structured state reply decodes to the SAME tool calls a tool round
// returns, so both vehicles share one fold. Pinned: entries keep their order and their args' string encoding, a
// strict-compatible `null` means "omitted", a reply that is not a non-empty `changes` list is refused whole, and an
// entry with no tool name is counted rather than guessed at.

import type { RpgToolCall } from "@orb/contracts/rpg";
import { structuredChangesToToolCalls, toolCallsToExtraction } from "@orb/contracts/rpg";
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

  expect(decoded).toEqual({ calls: sameCallsAsTools, unreadable: 0 });
  expect(toolCallsToExtraction(decoded?.calls ?? [])).toEqual(toolCallsToExtraction(sameCallsAsTools));
});

test("a reply that is not a non-empty `changes` list is refused whole", () => {
  for (const reply of [null, "text", [], {}, { changes: [] }, { changes: "update_scene" }]) {
    expect(structuredChangesToToolCalls(reply), JSON.stringify(reply)).toBeNull();
  }
});

test("an entry with no tool name is counted, and every other entry still decodes", () => {
  const decoded = structuredChangesToToolCalls({ changes: [{ args: { location: "x" } }, "update_scene", { tool: "no_changes", args: {} }] });

  expect(decoded).toEqual({ calls: [{ name: "no_changes", arguments: "{}" }], unreadable: 2 });
});
