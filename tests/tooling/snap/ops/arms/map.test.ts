// @instrument-proof: the `map=` / `map-dom-fallbacks=` RESULT pairs count EVERY page's rows. Reading the
//   first outcome that carried a map made a multi-page run print one page's population as the run's, so a
//   reader comparing the RESULT line against the emitted fact saw two different numbers for one run
//   (#1509) — and the smaller one looked like a smaller surface, not like a truncated count.
// @instrument-absence-proof: with `--map` off, and with the flag on but every page failing to capture,
//   the pairs stay "no"/"0" rather than borrowing a neighbour's population.
import type { MapEntry } from "../../../../../tooling/src/snap/contract/map.ts";
import type { CaptureOutcome } from "../../../../../tooling/src/snap/contract/types.ts";
import { MAP_ARM } from "../../../../../tooling/src/snap/ops/arms/map.ts";
import { parseSnapArgs } from "../../../../../tooling/src/snap/ops/parse.ts";
import { expect, test } from "../../../../support/tool-fixtures.ts";

function entry(source: MapEntry["source"]): MapEntry {
  return {
    role: "button",
    name: "Save",
    selector: '[data-testid="save"]',
    state: { disabled: null, current: null, checked: null, expanded: null },
    visibility: "visible",
    inactiveReason: null,
    actionability: "actionable",
    source,
  };
}

function outcome(pageIndex: number, mapResult: MapEntry[] | null): CaptureOutcome {
  return {
    pageIndex,
    navError: null,
    stepFailures: 0,
    navFailures: 0,
    driveFailures: [],
    fileActions: [],
    heap: null,
    deadCss: [],
    emptyCss: [],
    deadCssEvidence: null,
    ariaText: null,
    ariaError: null,
    evalResults: [],
    contrastResults: [],
    contrastEvidence: [],
    mapResult,
    mapError: null,
    mapAtlas: null,
    mapAtlasError: null,
    mapShell: null,
    mapShellError: null,
    assertions: [],
    perf: null,
    cssEvidence: null,
    evidenceRange: null,
    themeStampGap: null,
  };
}

function pairsFor(outcomes: readonly CaptureOutcome[], argv: readonly string[]): Record<string, string> {
  const opts = parseSnapArgs(["/x", ...argv]);
  const pairs = MAP_ARM.lifecycle.pairs({
    opts,
    outcomes,
    ctx: { url: "/x", out: "reports/snaps/x.png", produceShot: true, failed: [], totalPages: outcomes.length },
  });
  return Object.fromEntries(pairs.map(([key, value]) => [key, String(value)]));
}

test("the map RESULT pairs count every page, not the first page that captured one", () => {
  const outcomes = [outcome(0, [entry("semantic"), entry("dom")]), outcome(1, [entry("semantic"), entry("semantic"), entry("dom")])];

  // 5 rows over two pages, 2 of them DOM fallbacks. Before the fix this read map=2 / fallbacks=1.
  expect(pairsFor(outcomes, ["--map"])).toMatchObject({ map: "5", "map-dom-fallbacks": "2" });
});

test("a page that captured nothing contributes nothing rather than hiding a later page's rows", () => {
  const outcomes = [outcome(0, null), outcome(1, [entry("semantic")])];

  expect(pairsFor(outcomes, ["--map"])).toMatchObject({ map: "1", "map-dom-fallbacks": "0" });
});

test("with --map off the pairs say so, and with it on over an empty population they say zero", () => {
  expect(pairsFor([outcome(0, null)], [])).toMatchObject({ map: "no", "map-dom-fallbacks": "no" });
  expect(pairsFor([outcome(0, null)], ["--map"])).toMatchObject({ map: "0", "map-dom-fallbacks": "0" });
});
