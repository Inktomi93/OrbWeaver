// EVERY VOTING ARM OWES A ROW, AND EVERY ROW OWES ITS DISPOSITION (#1385 items 4 and 5).
//
// Two dogfood complaints, one layer. (5) a red `--contrast` run printed two `CONTRAST … FAIL` lines and
// exactly one composite finding: `run failed with no structured problem row … conflicts="producer-specific
// actionable evidence was absent"`. The evidence plainly existed — the fallback fired because no ANALYZER
// had written a problem artifact, which is true of most arms and says nothing about whether the run
// explained itself. (4) a `FINDING error | ResizeObserver loop …` printed beside `console-errors=0` and
// exit 0, with nothing on the row saying whether a reader should file it.
//
// Both are fixed at the drafting layer: a failing ARM VERDICT becomes its own row (with the arm's own
// detail and `next=` narrowing to `--arm <it>`), the fallback fires only when no arm is in a voting state,
// and every row states which run counter its evidence entered.
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import type { SnapRunIndex } from "../../../../tooling/src/snap/contract/run-index.ts";
import { collectSnapFindings } from "../../../../tooling/src/snap/lib/run-findings.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const INDEX_PATH = "/tmp/orb-run/run.json";

function armVerdict(over: Partial<SnapRunIndex["verdict"]["arms"][number]>): SnapRunIndex["verdict"]["arms"][number] {
  return {
    arm: "contrast",
    source: "computed style + framebuffer contrast",
    lifetime: "settled page capture",
    state: "failed",
    artifacts: [],
    detail: null,
    ...over,
  };
}

function input(
  arms: readonly SnapRunIndex["verdict"]["arms"][number][],
  state: "failed" | "refused" | "passed" = "failed",
): Parameters<typeof collectSnapFindings>[0] {
  return {
    indexPath: INDEX_PATH,
    verdict: { exit: state === "passed" ? EXIT.clean : EXIT.violations, state, arms },
    artifacts: [],
    diagnosticsState: "complete",
    diagnostics: [],
  };
}

test("a failing arm becomes its OWN row carrying the arm's detail — the fallback does not fire beside it", async () => {
  const detail = "2 contrast check(s) failed: CONTRAST [data-slot=x]: 1.69:1 FAIL (text · need 4.5) · CONTRAST [data-slot=y]: 2.10:1 FAIL";
  const findings = await collectSnapFindings(input([armVerdict({ detail })]));

  expect(findings).toHaveLength(1);
  expect(findings[0]?.what).toBe(detail);
  expect(findings[0]?.arms).toEqual(["contrast"]);
  // The row narrows to the arm that produced it, so `next=` is a command that replays exactly this.
  expect(findings[0]?.next).toContain("--arm contrast");
  // The fallback's own text is a CLAIM about the run, and it may only be made when it is true.
  expect(findings.some((row) => row.what.includes("no structured problem row"))).toBe(false);
  expect(findings[0]?.disposition).toEqual({ counted: true, reason: "contrast-arm" });
});

test("an arm that failed without a detail still gets a row that names the arm and its state", async () => {
  const findings = await collectSnapFindings(input([armVerdict({ arm: "assert", state: "refused", detail: null })]));

  expect(findings).toHaveLength(1);
  expect(findings[0]?.what).toContain("assert");
  expect(findings[0]?.what).toContain("refused");
});

test("a WITHHELD arm's row cannot claim completeness — an absent measurement is not a complete one", async () => {
  const findings = await collectSnapFindings(input([armVerdict({ arm: "motion", state: "withheld", detail: "nothing composited" })]));

  expect(findings[0]?.completeness).toBe("incomplete");
});

test("THE FALLBACK STILL EXISTS: a non-passing run with no voting arm at all keeps the unattributed row", async () => {
  // The negative control for the two arms above. Without it, "the fallback did not fire" would be
  // satisfied by a fallback that can no longer fire at all — which would hide an exit nobody described.
  const findings = await collectSnapFindings(input([armVerdict({ state: "passed" })]));

  expect(findings).toHaveLength(1);
  expect(findings[0]?.what).toContain("no structured problem row");
  expect(findings[0]?.disposition).toEqual({ counted: false, reason: "unattributed-exit" });
});

test("a PASSING run produces no rows at all — neither the arm rows nor the fallback", async () => {
  expect(await collectSnapFindings(input([armVerdict({ state: "passed" })], "passed"))).toHaveLength(0);
});
