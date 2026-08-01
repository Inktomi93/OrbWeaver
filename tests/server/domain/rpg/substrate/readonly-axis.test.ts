// tests/server/domain/rpg/substrate/readonly-axis — the honest-arms `trackersReadOnly` derivation
// (rpg-design/05 §4.6). Pure: the resolved mode + the connection capability → whether the model has a write
// path. Both surviving modes need tools; the structured write path (the resync + the agent-sdk degrade) is
// keyed by capability alone (`hasStructuredWriter`). NO silent downgrade.

import type { ModelCapability } from "@orb/contracts/connection";
import { deriveTrackersReadOnly, hasStructuredWriter } from "../../../../../packages/server/src/domain/rpg/substrate/readonly-axis";
import { expect, test } from "../../../../support/fixtures";

/** A minimal capability with the two write-relevant axes toggleable. */
function capability(over: { tools?: boolean; structured?: boolean }): ModelCapability {
  return {
    reasoning: { mode: "none", enabled: false },
    sampling: {},
    output: { maxTokens: { min: 1, max: 4096 }, ...(over.structured !== undefined ? { structured: over.structured } : {}) },
    context: { window: 8192 },
    ...(over.tools !== undefined && over.tools ? { tools: { parallel: false } } : {}),
  };
}

test("a null capability is readonly by construction (never assume a write path)", () => {
  expect(deriveTrackersReadOnly("cheap", null)).toBe(true);
  expect(deriveTrackersReadOnly("folded", null)).toBe(true);
  expect(hasStructuredWriter(null)).toBe(false);
});

test("cheap keys on tools", () => {
  expect(deriveTrackersReadOnly("cheap", capability({ tools: true }))).toBe(false);
  expect(deriveTrackersReadOnly("cheap", capability({ tools: false }))).toBe(true);
});

test("the STRUCTURED write path (resync / the agent-sdk degrade) keys on structured output, NOT tools", () => {
  expect(hasStructuredWriter(capability({ structured: true }))).toBe(true);
  expect(hasStructuredWriter(capability({ structured: false }))).toBe(false);
  // A tool-capable-but-not-structured model has NO structured write path (no cross-axis leakage).
  expect(hasStructuredWriter(capability({ tools: true, structured: false }))).toBe(false);
  // …and the per-turn modes do not inherit it: tools are their vehicle, structured output is not.
  expect(deriveTrackersReadOnly("cheap", capability({ structured: true, tools: false }))).toBe(true);
});

test("R1: folded keys on tools too — it mounts the SAME tools, just on the character turn", () => {
  expect(deriveTrackersReadOnly("folded", capability({ tools: true }))).toBe(false);
  expect(deriveTrackersReadOnly("folded", capability({ tools: false }))).toBe(true);
  // A structured-only model has NO write path in folded mode: the fold's vehicle is tools, and the honest
  // verdict is manual-steering — never a silent re-route to a schema round (D108 honest-arms).
  expect(deriveTrackersReadOnly("folded", capability({ structured: true, tools: false }))).toBe(true);
});
