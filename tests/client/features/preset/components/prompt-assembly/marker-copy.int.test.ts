// Unit: marker copy registry (features/preset/components/prompt-assembly/marker-copy). PURE, node lane,
// DEEP import. The registry is Record<MarkerType, …> — exhaustive BY TYPE (a new marker is a tsc error,
// not a blank row). This test proves the RUNTIME shape matches the compile-time contract: every
// MARKER_TYPES member has a copy entry and every entry carries all three non-empty strings (BUILD-SPEC §2.1).

import { MARKER_TYPES } from "@orb/contracts/preset";
import { MARKER_COPY } from "../../../../../../packages/client/src/features/preset/components/prompt-assembly/marker-copy.ts";
import { expect, test } from "../../../../../support/fixtures.ts";

test("every MarkerType has a copy entry with non-empty label/oneLiner/subtitle", () => {
  for (const marker of MARKER_TYPES) {
    const copy = MARKER_COPY[marker];
    expect(copy, `missing copy for marker ${marker}`).toBeDefined();
    expect(copy.label.length).toBeGreaterThan(0);
    expect(copy.oneLiner.length).toBeGreaterThan(0);
    expect(copy.subtitle.length).toBeGreaterThan(0);
  }
});

test("the registry has exactly one entry per marker — no extras", () => {
  expect(Object.keys(MARKER_COPY).sort()).toEqual(MARKER_TYPES.toSorted());
});

// `previewCue` is the ASSEMBLED PREVIEW's one-line pointer at `templateNote` (side-eye 2026-08-08 P2). The
// pairing is the whole contract: the cue says "there is more here" and the note is the more. A cue with no
// note points at nothing — the reader clicks through to a drill-in that never explains what adapts — and
// only a runtime check can see it, since both fields are optional strings to tsc.
test("a preview cue never points at an absent explanation", () => {
  const cued = MARKER_TYPES.filter((marker) => MARKER_COPY[marker].previewCue !== undefined);
  // Non-vacuity first: a zero here means the preview stopped cueing anything, and the pairing check below
  // would pass by having nothing to check.
  expect(cued.length, "no marker carries a previewCue — the assertion below would be vacuous").toBeGreaterThan(0);
  expect(
    cued.filter((marker) => MARKER_COPY[marker].templateNote === undefined),
    "a previewCue with no templateNote points at nothing",
  ).toEqual([]);
  expect(
    cued.filter((marker) => MARKER_COPY[marker].previewCue?.trim() === ""),
    "an empty previewCue renders a blank line",
  ).toEqual([]);
});
