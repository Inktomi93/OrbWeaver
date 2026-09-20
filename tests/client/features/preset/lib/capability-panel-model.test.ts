// Unit: the descriptor-driven params-panel MODEL (features/preset/lib/capability-panel-model). No DOM — the
// node lane. Guards the W10 Panel-2 GATE logic: the panel RENDERS FROM `ModelCapabilityView`, so a model
// with `sampling: {}` shows NO sampling knobs; an unlisted knob is ABSENT; slider ranges come from each
// knob's descriptor `Range`; the reasoning control is DERIVED from `reasoning.mode` (off-toggle + the
// model's ACTUAL effortLevels / budgetRange / adaptive note); verbosity shows only when present; and the
// quality dial exposes DISPLAY COPY only (its effort mapping lives server-side in the funnel, not here).
// These are exactly the invariants that keep the panel descriptor-driven rather than a hardcoded knob stack.

import type { GenerationCapability, Range } from "@orb/contracts/inference";
import { QUALITY_LEVELS } from "@orb/contracts/preset";
import {
  QUALITY_OPTIONS,
  QUALITY_SELECT_ITEMS,
  qualityFromSelect,
  qualitySelectValue,
  reasoningControlFor,
  samplingKnobsFor,
  supportsSeed,
  verbosityLevelsFor,
} from "../../../../../packages/client/src/features/preset/lib/capability-panel-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const R = (min: number, max: number): Range => ({ min, max });

/** A minimal capability with everything empty/off — override the axes a test exercises. */
function capability(overrides: Partial<ModelCapability> = {}): ModelCapability {
  return {
    reasoning: { mode: "none", enabled: false },
    sampling: {},
    output: { maxTokens: R(1, 4096) },
    context: { window: 200_000 },
    ...overrides,
  };
}

// --- sampling iteration (the GATE) -------------------------------------------

test("a model with sampling:{} shows NO sampling knobs (agent-sdk Claude)", () => {
  expect(samplingKnobsFor(capability({ sampling: {} }))).toEqual([]);
});

test("only the LISTED sampling knobs render, each with the descriptor's Range", () => {
  const knobs = samplingKnobsFor(capability({ sampling: { temperature: R(0, 2), minP: R(0, 1) } }));
  const fields = knobs.map((k) => k.field);
  // temperature + minP are listed → present, in render order (temperature before minP).
  expect(fields).toEqual(["params.temperature", "params.minP"]);
  // topP is NOT listed → absent (no disabled-slider).
  expect(fields).not.toContain("params.topP");
  // The slider bounds come from the descriptor Range, not a hardcoded default.
  const temp = knobs.find((k) => k.field === "params.temperature");
  expect(temp?.range).toEqual(R(0, 2));
});

test("seed is a descriptor BOOLEAN flag, not a Range slider knob", () => {
  const withSeed = capability({ sampling: { seed: true } });
  // seed does not appear as a slider knob…
  expect(samplingKnobsFor(withSeed)).toEqual([]);
  // …but supportsSeed reports it (the panel renders a number field for it).
  expect(supportsSeed(withSeed)).toBe(true);
  expect(supportsSeed(capability({ sampling: {} }))).toBe(false);
});

// --- reasoning control (keyed by mode) ---------------------------------------

test("reasoning mode 'none' → no reasoning control at all", () => {
  const control = reasoningControlFor(capability({ reasoning: { mode: "none", enabled: false } }));
  expect(control.kind).toBe("none");
  expect(control.reasons).toBe(false);
});

test("reasoning mode 'effort' → the model's ACTUAL effortLevels only (never the full enum)", () => {
  const control = reasoningControlFor(capability({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "high"] } }));
  expect(control.kind).toBe("effort");
  expect(control.reasons).toBe(true);
  expect(control.effortLevels).toEqual(["low", "high"]);
});

test("reasoning mode 'budget' → the budgetRange slider bounds", () => {
  const control = reasoningControlFor(capability({ reasoning: { mode: "budget", enabled: true, budgetRange: R(1024, 32_000) } }));
  expect(control.kind).toBe("budget");
  expect(control.budgetRange).toEqual(R(1024, 32_000));
});

test("reasoning mode 'adaptive' → the adaptive note (no manual dial)", () => {
  const control = reasoningControlFor(capability({ reasoning: { mode: "adaptive", enabled: true } }));
  expect(control.kind).toBe("adaptive");
  expect(control.reasons).toBe(true);
  expect(control.effortLevels).toBeUndefined();
  expect(control.budgetRange).toBeUndefined();
});

// --- verbosity (only when present) -------------------------------------------

test("verbosity levels come from the descriptor; absent ⇒ no verbosity section", () => {
  expect(verbosityLevelsFor(capability({ verbosity: ["low", "high"] }))).toEqual(["low", "high"]);
  expect(verbosityLevelsFor(capability())).toBeUndefined();
});

// --- the quality dial → DISPLAY COPY only (the effort mapping is server-side) -------------------------

test("the quality dial covers every QUALITY_LEVELS member, in order, with display copy", () => {
  expect(QUALITY_OPTIONS.map((o) => o.value)).toEqual([...QUALITY_LEVELS]);
  // Each option carries the non-empty label + description the panel renders; the panel does NOT re-map
  // quality → effort (that derivation lives once in the funnel via @orb/contracts/preset.QUALITY_EFFORT).
  for (const option of QUALITY_OPTIONS) {
    expect(option.label.length).toBeGreaterThan(0);
    expect(option.description.length).toBeGreaterThan(0);
  }
});

test("the dial's SELECT vocabulary leads with the OFF arm, and OFF round-trips as the ABSENCE (O-18)", () => {
  // The dropdown's "don't use quality" must be a REAL arm the user can pick and re-read — and its storage
  // form is no `quality` key at all (the funnel's own off arm; a fourth enum member would have to map to
  // something). These two functions are the only place that sentinel exists.
  const values = (QUALITY_SELECT_ITEMS as readonly { readonly value: string; readonly label: string }[]).map((item) => item.value);
  expect(values.slice(1)).toEqual([...QUALITY_LEVELS]);
  expect(values[0]).not.toBe("");

  // OFF → nothing stored → OFF again (the round trip the Select renders).
  const off = values[0] ?? "";
  expect(qualityFromSelect(off)).toBeUndefined();
  expect(qualitySelectValue(qualityFromSelect(off))).toBe(off);
  // …and a real level survives the same trip untouched.
  expect(qualityFromSelect("deep")).toBe("deep");
  expect(qualitySelectValue("deep")).toBe("deep");
  // An unknown wire value is the absence too — never a fabricated dial.
  expect(qualityFromSelect(null)).toBeUndefined();
  expect(qualityFromSelect("nonsense")).toBeUndefined();
});
