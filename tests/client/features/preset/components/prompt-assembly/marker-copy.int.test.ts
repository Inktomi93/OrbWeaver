// Unit: marker copy registry (features/preset/components/prompt-assembly/marker-copy). PURE, node lane,
// DEEP import. The registry is Record<MarkerType, …> — exhaustive BY TYPE (a new marker is a tsc error,
// not a blank row). This test proves the RUNTIME shape matches the compile-time contract: every
// MARKER_TYPES member has a copy entry and every entry carries all three non-empty strings (BUILD-SPEC §2.1).

import { MARKER_TYPES } from "@orb/contracts/preset";
import { MARKER_COPY } from "../../../../../../packages/client/src/features/preset/components/prompt-assembly/marker-copy";
import { expect, test } from "../../../../../support/fixtures";

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
  expect(Object.keys(MARKER_COPY).sort()).toEqual([...MARKER_TYPES].sort());
});
