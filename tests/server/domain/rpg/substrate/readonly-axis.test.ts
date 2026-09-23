// tests/server/domain/rpg/substrate/readonly-axis — the honest-arms `trackersReadOnly` derivation
// (docs/plans/rpg/design.md). Pure: the resolved mode + the connection capability → whether the model has a write
// path. Both surviving modes need tools; the structured write path (the resync + the agent-sdk degrade) is
// keyed by capability alone (`hasStructuredWriter`). NO silent downgrade.

import type { GenerationCapability } from "@orb/contracts/inference";
import { deriveEffectiveDelivery, deriveTrackersReadOnly, hasStructuredWriter } from "../../../../../packages/server/src/domain/rpg/substrate/readonly-axis.ts";
import { expect, test } from "../../../../support/fixtures.ts";

/** A minimal capability with the two write-relevant axes toggleable. */
function capability(over: { tools?: boolean; structured?: boolean }): GenerationCapability {
  return {
    reasoning: { mode: "none", enabled: false },
    sampling: {},
    input: ["text"],
    output: { maxTokens: { min: 1, max: 4096 }, modalities: ["text"], ...(over.structured !== undefined ? { structured: over.structured } : {}) },
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

// EFF-3 — the EFFECTIVE delivery the panel's freshness pill renders. The bug it closes: the pill keyed on the
// MODE, so every `folded` game claimed "Live", including the ones the fold guard silently downgraded to the
// post-commit round (D112 (4)'s KNOWN GAP).

test("EFF-3: a folded game that folds is `folded` with no downgrade cause", () => {
  expect(deriveEffectiveDelivery("folded", { trackersReadOnly: false, foldGuarded: false })).toEqual({ path: "folded", fallbackReason: null });
});

test("EFF-3: a FOLD-GUARDED folded game reports the round it actually runs, and NAMES the cause", () => {
  expect(deriveEffectiveDelivery("folded", { trackersReadOnly: false, foldGuarded: true })).toEqual({
    path: "tool-round",
    fallbackReason: "local-engine-fold-guard",
  });
});

test("EFF-3: an EXPLICIT cheap game rounds with NO cause — the host got what they asked for, nothing was downgraded", () => {
  expect(deriveEffectiveDelivery("cheap", { trackersReadOnly: false, foldGuarded: false })).toEqual({ path: "tool-round", fallbackReason: null });
  // The guard governs only where `folded` lands (D112 as amended): it must never re-label an explicit choice
  // as a degrade, or the panel would blame the model for the host's own knob.
  expect(deriveEffectiveDelivery("cheap", { trackersReadOnly: false, foldGuarded: true })).toEqual({ path: "tool-round", fallbackReason: null });
});

test("EFF-3: no model write path ⇒ `none` — no vehicle runs, so neither freshness claim is true", () => {
  // The readonly verdict WINS over both other inputs: the flush's F2 gate returns before any round, so a
  // "one beat behind" label would be as false as "Live". Every input combination collapses to the same answer.
  expect(deriveEffectiveDelivery("folded", { trackersReadOnly: true, foldGuarded: false })).toEqual({ path: "none", fallbackReason: null });
  expect(deriveEffectiveDelivery("folded", { trackersReadOnly: true, foldGuarded: true })).toEqual({ path: "none", fallbackReason: null });
  expect(deriveEffectiveDelivery("cheap", { trackersReadOnly: true, foldGuarded: false })).toEqual({ path: "none", fallbackReason: null });
});

test("R1: folded keys on tools too — it mounts the SAME tools, just on the character turn", () => {
  expect(deriveTrackersReadOnly("folded", capability({ tools: true }))).toBe(false);
  expect(deriveTrackersReadOnly("folded", capability({ tools: false }))).toBe(true);
  // A structured-only model has NO write path in folded mode: the fold's vehicle is tools, and the honest
  // verdict is manual-steering — never a silent re-route to a schema round (D108 honest-arms).
  expect(deriveTrackersReadOnly("folded", capability({ structured: true, tools: false }))).toBe(true);
});
