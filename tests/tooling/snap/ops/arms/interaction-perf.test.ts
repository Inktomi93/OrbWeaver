// @instrument-proof: the interaction-perf artifact's completeness stamp is DERIVED from the gaps the run
// recorded, in both directions.
// @instrument-absence-proof: a run that captured no timing data may not file the stamp a clean run files.
//
// #1507: `collectPerfEvidence` wrote `completeness: "complete"` as a LITERAL six lines below the loop that
// pushes an evidence gap for every page whose in-page `__perfMeter` was absent or malformed. So the run
// that measured NOTHING published the same "complete" stamp as the run that measured everything, and every
// downstream reader — the run index, `--problems`, a review lane grepping for bounded evidence — believed
// it. `unknown`, not `bounded`: a missing meter cannot say how much it lost, so there is no limit policy to
// express (the heap arm makes the same call for a snapshot whose population it cannot count).

import { expect, test } from "@orb/testkit/tooling";
import { EXIT } from "@orb/tooling/floor/cli/exit-contract";
import { meterApparatusGap, meterEvidenceGaps } from "../../../../../tooling/src/cpu-profile/index.ts";
import { interactionPerfCompleteness, interactionPerfExit, pageMeterEvidence } from "../../../../../tooling/src/snap/ops/arms/interaction-perf.ts";

test("no gaps ⇒ the artifact is complete (#1507 positive control)", () => {
  expect(interactionPerfCompleteness([])).toEqual({
    completeness: "complete",
    completenessDetail: "complete observer records for the finite shared action tape",
  });
});

test("a missing in-page meter makes the artifact UNKNOWN, and the detail NAMES the gap (#1507 red-first)", () => {
  const stamp = interactionPerfCompleteness([{ evidence: "the in-page meter apparatus", detail: "http://x/ never installed __perfMeter" }]);
  expect(stamp.completeness).toBe("unknown");
  expect(stamp.completenessDetail).toContain("1 evidence gap");
  // The reader must be able to act on it without opening the artifact's body.
  expect(stamp.completenessDetail).toContain("the in-page meter apparatus");
});

test("every gap is named, not just the first — a run with two blind pages says two (#1507)", () => {
  const stamp = interactionPerfCompleteness([
    { evidence: "the in-page meter apparatus", detail: "page 0" },
    { evidence: "the in-page meter payload", detail: "page 1 returned a malformed payload" },
  ]);
  expect(stamp.completeness).toBe("unknown");
  expect(stamp.completenessDetail).toContain("2 evidence gap(s)");
  expect(stamp.completenessDetail).toContain("the in-page meter payload");
});

// The collector's own per-page read: what a page's raw `__perfMeter` becomes, then what the stamp and the exit do with it.
const URL_UNDER_TEST = "http://x/";
const MEASURED_METER = {
  longTasks: [],
  events: [],
  shifts: [],
  rafGaps: [],
  stepMarks: [{ idx: 0, label: "click #go", t: 10 }],
  installed: ["longtask"],
};

test("a page whose meter read back valid files a complete stamp and an exit that keeps the call's code", () => {
  const evidence = pageMeterEvidence(MEASURED_METER, URL_UNDER_TEST);
  expect(evidence.data).toEqual(MEASURED_METER);
  expect(evidence.gaps).toEqual([]);
  expect(interactionPerfCompleteness(evidence.gaps).completeness).toBe("complete");
  expect(interactionPerfExit(EXIT.clean, evidence.gaps, null, [])).toBe(EXIT.clean);
});

test("a page with no meter global yields no data and a gap that turns the stamp unknown and the exit a tool error", () => {
  const evidence = pageMeterEvidence(undefined, URL_UNDER_TEST);
  expect(evidence.data).toBeNull();
  expect(evidence.gaps).toEqual([meterApparatusGap(URL_UNDER_TEST)]);
  expect(interactionPerfCompleteness(evidence.gaps).completeness).toBe("unknown");
  expect(interactionPerfExit(EXIT.clean, evidence.gaps, null, [])).toBe(EXIT.toolError);
});

test("a malformed meter payload is distrusted: no data, one payload gap naming the page, unknown stamp", () => {
  const evidence = pageMeterEvidence({ ...MEASURED_METER, longTasks: "none" }, URL_UNDER_TEST);
  expect(evidence.data).toBeNull();
  expect(evidence.gaps).toEqual([{ evidence: "the in-page meter payload", detail: expect.stringContaining(URL_UNDER_TEST) }]);
  expect(interactionPerfCompleteness(evidence.gaps).completeness).toBe("unknown");
  expect(interactionPerfExit(EXIT.clean, evidence.gaps, null, [])).toBe(EXIT.toolError);
});

test("a valid meter that dispatched no step keeps its data but still records the empty-population gap", () => {
  const evidence = pageMeterEvidence({ ...MEASURED_METER, stepMarks: [] }, URL_UNDER_TEST);
  expect(evidence.data).not.toBeNull();
  expect(evidence.gaps).toEqual(meterEvidenceGaps({ ...MEASURED_METER, stepMarks: [] }));
  expect(interactionPerfCompleteness(evidence.gaps).completeness).toBe("unknown");
});
