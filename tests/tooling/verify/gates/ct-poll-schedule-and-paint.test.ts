// The family net for the two Playwright poll laws (#121) AND their §4.6 SPLIT-ARM DIFFERENTIAL (#2000,
// p-parity-tier1).
//
// `ct-poll-schedule-and-paint-health` exists BECAUSE one legacy descriptor carried three arms: ARM A (a
// shared `intervals` schedule) and ARM B (an unbarriered untrusted trigger) are per-node occurrence checks,
// while ARM C — the founding-file blindness tripwire — is a whole-population question. The split gave A+B
// `execution: "selected-files"` and C `execution: "entire-population"`, so the legacy gate's behaviour is
// now the behaviour of both policies together. This file compares them against the frozen legacy
// descriptor at `bd56189ba`, the commit immediately before `47c35b61c` split them.
//
// THE CLASSIFIED DIFFERENCES:
//   1. SPLIT — one legacy gate, two final policies.
//   2. THE BLINDNESS GUARD CHANGED MECHANISM. The legacy `finalize` self-guarded on a REAL-TREE ANCHOR
//      (`fileLoaded(packages/db/src/schema/index.ts)`) so a conformance mini-project could not "prove" the
//      founding file rotted. The final health policy has no anchor: it narrows its own POPULATION to the
//      founding file (`{ in: ["@tests"], under: ["tests/client/lib/**"], named: ["motion-stats.ct.tsx"] }`)
//      and declares `execution: "entire-population"`, so a narrowed request defers it. Over a two-file
//      fixture the two therefore disagree by design, which is why ARM A+B are replayed against the
//      occurrence policy and ARM C gets its own successor proof below with the legacy anchor present.
//   3. ARM C's ANCHOR_GONE SUB-ARM WAS RETIRED INTO A TOOL ERROR. The legacy reported a gate-owned finding
//      on line 1 of the gate module when the founding file was missing. Under the final contract that
//      population resolves to zero admitted paths from a NON-EMPTY `@tests` candidate set, which
//      `resolvePopulation` REFUSES — louder, not quieter, and the successor test below asserts the refusal
//      verbatim rather than trusting the module header's claim of it.
//   4. ARM C's FOUR CONTENT sub-arms survive unchanged in wording, but are anchored on the FOUNDING FILE
//      itself rather than on the gate module (same reason as 3 — the gate module is outside `@tests`).
//
// THE FINDING THIS DIFFERENTIAL PRODUCED (reported to #2000/#2005): the legacy corpus NEVER EXERCISED ARM
// C. None of the legacy gate's 7 mustFlag / 7 mustPass examples loads `packages/db/src/schema/index.ts`, so
// `finalize` returned at its first line in every one of them — the arm the split carried out into its own
// policy was covered by zero legacy rows. The successor proof below is therefore CONSTRUCTED from the
// legacy arm's own trigger conditions, not replayed from its corpus.
import { gate as occurrence } from "../../../../tooling/src/verify/gates/ct-poll-schedule-and-paint.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/ct-poll-schedule-and-paint-health.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("a shared poll schedule and an unbarriered evaluate trigger are flagged, and the founding anchor stays sound", () => {
  expect(verifyPolicyProofs([occurrence, health])).toEqual([]);
});
