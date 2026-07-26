// @orb/kit/side-gen-posture — the pure side-gen sampling resolver. Pins the ladder fold: right-to-left
// (floor ← preset params ← per-action override), absent-skips at every rung, and the empty-floor honesty
// (an all-absent result is `{}`, never `undefined`-valued keys — the backend default stands).

import { resolveSideGenSampling } from "@orb/kit/side-gen-posture";
import { expect, test } from "../../support/fixtures";

test("floor-only: a floor with no higher rung passes through verbatim", () => {
  expect(resolveSideGenSampling({ temperature: 0.2, maxOutputTokens: 24 })).toEqual({ temperature: 0.2, maxOutputTokens: 24 });
});

test("preset params override the floor per-knob; an absent preset knob defers to the floor", () => {
  const out = resolveSideGenSampling({ temperature: 0.2, maxOutputTokens: 24 }, { temperature: 0.9 });
  // temperature came from the preset (0.9 wins over the floor 0.2); maxOutputTokens deferred to the floor.
  expect(out).toEqual({ temperature: 0.9, maxOutputTokens: 24 });
});

test("per-action override is the TOP rung — it beats both the preset params and the floor", () => {
  const out = resolveSideGenSampling({ temperature: 0.2, maxOutputTokens: 24 }, { temperature: 0.9, maxOutputTokens: 100 }, { temperature: 1.5 });
  // temperature from the action override (1.5); maxOutputTokens from the preset (100, no action override for it).
  expect(out).toEqual({ temperature: 1.5, maxOutputTokens: 100 });
});

test("topP folds the same way and is carried through when present at any rung", () => {
  expect(resolveSideGenSampling({}, { topP: 0.8 })).toEqual({ topP: 0.8 });
  expect(resolveSideGenSampling({ topP: 0.5 }, undefined, { topP: 0.95 })).toEqual({ topP: 0.95 });
});

test("empty floor + no rungs ⇒ {} (the caption case — the backend default stands, never undefined-valued keys)", () => {
  const out = resolveSideGenSampling({});
  expect(out).toEqual({});
  expect(Object.keys(out)).toHaveLength(0);
});

test("empty floor + preset params reaches the call (the caption ladder — user params now flow through)", () => {
  expect(resolveSideGenSampling({}, { temperature: 0.7, maxOutputTokens: 500 })).toEqual({ temperature: 0.7, maxOutputTokens: 500 });
});

test("a knob absent at EVERY rung is OMITTED from the result (never emitted as undefined)", () => {
  const out = resolveSideGenSampling({ temperature: 0.3 }, {}, {});
  expect(out).toEqual({ temperature: 0.3 });
  expect("maxOutputTokens" in out).toBe(false);
  expect("topP" in out).toBe(false);
});

test("a full UserIntent-shaped preset (a superset) folds by its sampling fields, ignoring the rest", () => {
  // The server passes a preset's whole `params` verbatim; the resolver reads only the three sampling knobs.
  // FABRICATION-OK: deliberate superset-shaped probe — the resolver must tolerate a WIDER shape than UserIntent and ignore unknown sibling keys.
  const presetLike = { temperature: 0.6, topK: 40, seed: 7, compaction: { mode: "managed" } } as never;
  expect(resolveSideGenSampling({ maxOutputTokens: 1024 }, presetLike)).toEqual({ temperature: 0.6, maxOutputTokens: 1024 });
});
