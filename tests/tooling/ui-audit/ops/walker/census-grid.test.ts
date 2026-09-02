// LAW 4's POPULATION GATE, EXECUTED (#1156) — the arms the CLI cannot reach.
//
// `off-grid-text` judged SCREEN-READER-ONLY text: the predicate that names it lived inside
// census-text.ts's sample literal, so the grid census never asked, and a node the browser paints nowhere
// was reported as blurred (the Characters list pane's `role=status` count span, 1 of 10 findings on the
// driven run). The repair moves the predicate to core.ts (`srOnlyText`, tri-state) and gives Law 4 an
// exclusion bucket plus a WITHHOLDING for the unanswerable case.
//
// THE CLI PROVES THE EXCLUSION (census-grid.int.test.ts, real browser, both sr-only shapes beside a
// painted twin). It CANNOT prove the refusal: `srOnlyText` is always defined in the composed walker and a
// non-finite rect is not something a fixture can author. So this file runs the SHIPPED string —
// `WALKER_CENSUS_GRID`, byte-for-byte what the page evaluates — inside a `node:vm` context whose globals
// are the segment's external names, and drives the predicate itself. Four arms, and the FALSE arm is the
// positive control: without it, a harness that could never reach `judged` would pass every refusal
// assertion vacuously. (`node:vm`, not `new Function` — the global Function constructor is biome-RED
// house-wide, and this repo already sandboxes untrusted source through vm in the regex watchdog.)
import { runInNewContext } from "node:vm";
import { WALKER_CENSUS_GRID } from "../../../../../tooling/src/ui-audit/ops/walker/census-grid.ts";
import { expect, test } from "../../../../support/tool-fixtures.ts";

interface CensusRow {
  candidates: number;
  judged: number;
  withheld: Record<string, number>;
  excluded: Record<string, number>;
}

/** One text candidate in a `will-change` layer at a quarter-pixel landing — the shape Law 4 judges, so
 *  every arm below differs ONLY in what the sr-only predicate answers about it. */
const CANDIDATE = {
  nodeType: 1,
  parentElement: null,
  closest: (): null => null,
  getBoundingClientRect: (): { top: number; left: number; width: number; height: number } => ({ top: 10.25, left: 0, width: 1, height: 1 }),
};

const COMPUTED = { willChange: "transform", transform: "none", transformStyle: "", backdropFilter: "none", fontSize: "13px", translate: "none", scale: "none" };

/** Evaluate the real segment with `srOnlyText` bound to whatever this arm wants to prove. */
function runLaw4(srOnlyText: unknown): CensusRow {
  const row: CensusRow = { candidates: 0, judged: 0, withheld: {}, excluded: {} };
  const accounting = { "off-grid-text": row, "promoted-layer-offset": { withheld: {}, excluded: {} }, "off-grid-transform": { withheld: {}, excluded: {} } };
  const bump = (target: Record<string, number>, reason: string): void => {
    target[reason] = (target[reason] ?? 0) + 1;
  };
  const sandbox = {
    window: { devicePixelRatio: 1 },
    getComputedStyle: (): typeof COMPUTED => COMPUTED,
    isVisible: (): boolean => true,
    describe: (): string => "div.candidate",
    authoredTargetClaim: (): string => "claim",
    authoredTargetHome: (): string => "home",
    relationalAccounting: accounting,
    excludeRelational: (target: CensusRow, reason: string): void => {
      bump(target.excluded, reason);
    },
    withholdRelational: (target: CensusRow, reason: string): void => {
      bump(target.withheld, reason);
    },
    textEls: [CANDIDATE],
    allEls: [],
    srOnlyText,
  };
  // The segment is a statement list, so it is wrapped in an IIFE — the only text added to the shipped
  // string, and it changes no scope the walker relies on (one function body, exactly as in the page).
  return runInNewContext(`(function () {\n${WALKER_CENSUS_GRID}\n  return relationalAccounting["off-grid-text"];\n})()`, sandbox) as CensusRow;
}

function settles(row: CensusRow): boolean {
  const sum = (counts: Record<string, number>): number => Object.values(counts).reduce((total, count) => total + count, 0);
  return row.candidates === row.judged + sum(row.withheld) + sum(row.excluded);
}

test("PLANTED CONTROL — a candidate the predicate calls painted is still JUDGED (the harness can reach a verdict)", () => {
  const row = runLaw4(() => false);
  expect(row.judged, "without this arm every refusal assertion below would pass vacuously").toBe(1);
  expect(row.excluded).toEqual({});
  expect(row.withheld).toEqual({});
  expect(settles(row)).toBe(true);
});

test("PLANTED CONTROL — a candidate the predicate calls screen-reader-only is EXCLUDED, never judged", () => {
  const row = runLaw4(() => true);
  expect(row.excluded).toEqual({ srOnly: 1 });
  expect(row.judged).toBe(0);
  expect(settles(row), "an exclusion stays in the denominator — a silent drop would break this identity").toBe(true);
});

test("a candidate whose box could not be read REFUSES — withheld, which makes the whole run NO VERDICT", () => {
  const row = runLaw4(() => null);
  expect(row.withheld, "null is 'I could not measure', and measurement-absence is never an exclusion").toEqual({ srOnlyUnreadable: 1 });
  expect(row.judged).toBe(0);
  expect(settles(row)).toBe(true);
});

test("a composition that never initialised the predicate REFUSES rather than judging every candidate", () => {
  // The failure this guards is a future segment re-order or a `var srOnlyText = function…` rewrite: a
  // `var` hoists UNDEFINED (walker.ts's ORDER note), and the old shape of this loop would have judged the
  // whole population without ever asking.
  const row = runLaw4(undefined);
  expect(row.withheld).toEqual({ srOnlyUnreadable: 1 });
  expect(row.judged).toBe(0);
  expect(settles(row)).toBe(true);
});

test("the predicate is CALLED, not re-spelled — census-grid asks core.ts's srOnlyText and nothing else", () => {
  expect(WALKER_CENSUS_GRID).toContain("srOnlyText(gtEl, null)");
  for (const respelling of ["isVisuallyHidden(gtEl)", "rect.width <= 2", "SR_ONLY_MAX_BOX_PX"]) {
    expect(WALKER_CENSUS_GRID, `${respelling} would be a second spelling of a predicate that has one home`).not.toContain(respelling);
  }
});
