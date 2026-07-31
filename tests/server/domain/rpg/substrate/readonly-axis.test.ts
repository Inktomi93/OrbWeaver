// tests/server/domain/rpg/substrate/readonly-axis — the honest-arms `trackersReadOnly` derivation
// (rpg-design/05 §4.6). Pure: the resolved mode + the connection capability → whether the model has a write
// path. The axis differs by mode (cheap + folded need tools; reliable needs structured output); NO silent
// downgrade.

import type { ModelCapability } from "@orb/contracts/connection";
import { deriveTrackersReadOnly } from "../../../../../packages/server/src/domain/rpg/substrate/readonly-axis";
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
  expect(deriveTrackersReadOnly("reliable", null)).toBe(true);
  expect(deriveTrackersReadOnly("folded", null)).toBe(true);
});

test("cheap keys on tools", () => {
  expect(deriveTrackersReadOnly("cheap", capability({ tools: true }))).toBe(false);
  expect(deriveTrackersReadOnly("cheap", capability({ tools: false }))).toBe(true);
});

test("reliable keys on structured output (NOT tools — no cross-axis leakage)", () => {
  expect(deriveTrackersReadOnly("reliable", capability({ structured: true }))).toBe(false);
  expect(deriveTrackersReadOnly("reliable", capability({ structured: false }))).toBe(true);
  // A tool-capable-but-not-structured model is readonly in reliable mode (the deliberate lever, not a downgrade).
  expect(deriveTrackersReadOnly("reliable", capability({ tools: true, structured: false }))).toBe(true);
});

test("R1: folded keys on tools too — it mounts the SAME tools, just on the character turn", () => {
  expect(deriveTrackersReadOnly("folded", capability({ tools: true }))).toBe(false);
  expect(deriveTrackersReadOnly("folded", capability({ tools: false }))).toBe(true);
  // A structured-only model has NO write path in folded mode: the fold's vehicle is tools, and the honest
  // verdict is manual-steering — never a silent re-route to reliable's schema (D108 honest-arms).
  expect(deriveTrackersReadOnly("folded", capability({ structured: true, tools: false }))).toBe(true);
});
