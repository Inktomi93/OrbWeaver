// The `tool-card` BINDING ROOT (plugin-ui-plane #679 U3): what a card's `{ $state: "…" }` paths resolve
// against. Pure, so it is pinned here rather than through a mount — the CT proves the rendered arm.
//
// The load-bearing property is that the projection is TOTAL over what a record can actually carry: the
// arguments come from a MODEL and the result comes from a GUEST, so neither is guaranteed to be JSON, and a
// card that binds a field must still render something rather than blow up the transcript row it lives in.

import type { ToolCallRecord } from "@orb/contracts/chat";
import { toolCardState } from "../../../../../packages/client/src/features/plugin/lib/plugin-tool-card-state.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function record(over: Partial<ToolCallRecord> = {}): ToolCallRecord {
  return { toolCallId: "call_1", name: "plugin_oracle__deck_draw", arguments: "{}", result: null, isError: false, durationMs: null, ...over };
}

test("a JSON result is parsed, so `result.<field>` paths resolve", () => {
  const state = toolCardState(record({ arguments: '{"count":2}', result: '{"commitment":"0000000042","dealt":2}', durationMs: 12 }));
  expect(state).toEqual({ args: { count: 2 }, result: { commitment: "0000000042", dealt: 2 }, isError: false, durationMs: 12 });
});

test("a NON-JSON payload degrades to the raw string — never a throw, never a null", () => {
  // The guest's return flows back verbatim, so a plugin that returns prose legitimately has prose here; a
  // model can likewise emit malformed argument JSON. Both must still bind.
  const state = toolCardState(record({ arguments: "not json", result: "The deck is spent." }));
  expect(state["args"]).toBe("not json");
  expect(state["result"]).toBe("The deck is spent.");
});

test("an UNEXECUTED call keeps its null result and reports the error flag the card can badge", () => {
  const state = toolCardState(record({ result: null, isError: true }));
  expect(state["result"]).toBeNull();
  expect(state["isError"]).toBe(true);
});
