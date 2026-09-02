// The panel-axis census (tooling/src/ui-audit/lib/surface-state.ts): design-audit reads exactly ONE
// shell configuration per run, so this pins the three arms that must never silently disagree —
// a genuinely mounted shell measures the one it saw and WITHHOLDS the rest of the space by name; an
// unmounted shell (no `.shell-grid` — landing/auth, or a boot still in flight) proves the whole axis
// EXCLUDED rather than guessing; a mounted shell missing one side entirely (should not happen — both
// `PanelChrome`s render unconditionally) excludes only that one side under its own reason.
//
// The DRIVE axis (#1059) rides the same accounting and is pinned here too: it is the one axis that is
// never excluded, because the regime a run measured is an argv fact rather than a shell reading — an
// unmounted shell was still reached either at rest or under an action queue.

import process from "node:process";
import type { ShellStateSnapshot } from "../../../../tooling/src/ui-audit/index.ts";
import {
  buildSurfaceStateAccounting,
  DRIVE_STATE_SPACE,
  FOCUS_STATE_SPACE,
  PANEL_MODE_SPACE,
  surfaceStateAxisLabel,
} from "../../../../tooling/src/ui-audit/index.ts";
import { surfaceStateRows } from "../../../../tooling/src/ui-audit/lib/result-rows.ts";
import { printSurfaceState } from "../../../../tooling/src/ui-audit/ops/report.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function shell(overrides: Partial<ShellStateSnapshot> = {}): ShellStateSnapshot {
  return {
    section: "home",
    panels: [
      { side: "list", mode: "docked", available: true },
      { side: "context", mode: "collapsed", available: true },
    ],
    chatOpen: false,
    focus: false,
    ...overrides,
  };
}

test("a mounted shell judges exactly the observed mode and withholds the rest of the space by name", () => {
  const accounting = buildSurfaceStateAccounting(shell(), "rest");

  expect(accounting.panelList.candidates).toBe(PANEL_MODE_SPACE.length);
  expect(accounting.panelList.judged).toBe(1);
  expect(accounting.panelList.withheld).toEqual({ collapsed: 1, overlay: 1 });
  expect(accounting.panelList.excluded).toEqual({});

  expect(accounting.panelContext.judged).toBe(1);
  expect(accounting.panelContext.withheld).toEqual({ docked: 1, overlay: 1 });

  expect(accounting.focus.candidates).toBe(FOCUS_STATE_SPACE.length);
  expect(accounting.focus.judged).toBe(1);
  expect(accounting.focus.withheld).toEqual({ on: 1 });
});

test("a mounted shell with focus ON withholds off, not on", () => {
  const accounting = buildSurfaceStateAccounting(shell({ focus: true }), "rest");
  expect(accounting.focus.withheld).toEqual({ off: 1 });
});

test("no shell mounted at all EXCLUDES every axis wholesale — a proven fact, not a guess", () => {
  const accounting = buildSurfaceStateAccounting(null, "rest");

  for (const census of [accounting.panelList, accounting.panelContext, accounting.focus]) {
    expect(census.judged).toBe(0);
    expect(census.withheld).toEqual({});
  }
  expect(accounting.panelList.excluded).toEqual({ "no-shell-mounted": PANEL_MODE_SPACE.length });
  expect(accounting.focus.excluded).toEqual({ "no-shell-mounted": FOCUS_STATE_SPACE.length });
});

test("a shell snapshot with an empty section and no panels is treated as unmounted", () => {
  const accounting = buildSurfaceStateAccounting(shell({ section: null, panels: [] }), "rest");
  expect(accounting.panelList.excluded).toEqual({ "no-shell-mounted": PANEL_MODE_SPACE.length });
});

test("a mounted shell missing one side's panel entry excludes ONLY that side, under its own reason", () => {
  const accounting = buildSurfaceStateAccounting(shell({ panels: [{ side: "list", mode: "docked", available: true }] }), "rest");

  expect(accounting.panelList.judged).toBe(1);
  expect(accounting.panelList.excluded).toEqual({});
  expect(accounting.panelContext.judged).toBe(0);
  expect(accounting.panelContext.withheld).toEqual({});
  expect(accounting.panelContext.excluded).toEqual({ "panel-not-rendered": PANEL_MODE_SPACE.length });
});

test("axis labels: withheld for the ordinary single-run case, excluded when the whole space is inapplicable", () => {
  const measured = buildSurfaceStateAccounting(shell(), "rest");
  expect(surfaceStateAxisLabel(measured.panelList)).toBe("withheld");

  const unmounted = buildSurfaceStateAccounting(null, "rest");
  expect(surfaceStateAxisLabel(unmounted.panelList)).toBe("excluded");
});

test("every axis's own accounting settles under assertCensusAccounting's invariant — candidates = judged + withheld + excluded", () => {
  for (const snapshot of [shell(), shell({ focus: true }), null, shell({ panels: [] })]) {
    const accounting = buildSurfaceStateAccounting(snapshot, "rest");
    for (const census of [accounting.panelList, accounting.panelContext, accounting.focus, accounting.drive]) {
      const withheldTotal = Object.values(census.withheld).reduce((a, b) => a + b, 0);
      const excludedTotal = Object.values(census.excluded).reduce((a, b) => a + b, 0);
      expect(census.candidates).toBe(census.judged + withheldTotal + excludedTotal);
    }
  }
});

test("the drive axis judges the regime this run measured and withholds the one it did not", () => {
  const rest = buildSurfaceStateAccounting(shell(), "rest");
  expect(rest.drive.candidates).toBe(DRIVE_STATE_SPACE.length);
  expect(rest.drive.judged).toBe(1);
  expect(rest.drive.withheld).toEqual({ driven: 1 });
  expect(rest.drive.excluded).toEqual({});

  const driven = buildSurfaceStateAccounting(shell(), "driven");
  expect(driven.drive.judged).toBe(1);
  expect(driven.drive.withheld).toEqual({ rest: 1 });
  expect(driven.drive.excluded).toEqual({});
});

test("an unmounted shell excludes every SHELL axis but still JUDGES the drive regime — it is an argv fact", () => {
  const accounting = buildSurfaceStateAccounting(null, "driven");
  expect(accounting.panelList.excluded).toEqual({ "no-shell-mounted": PANEL_MODE_SPACE.length });
  expect(accounting.focus.excluded).toEqual({ "no-shell-mounted": FOCUS_STATE_SPACE.length });
  expect(accounting.drive.excluded).toEqual({});
  expect(accounting.drive.judged).toBe(1);
  expect(surfaceStateAxisLabel(accounting.drive)).toBe("withheld");
});

// ── #1122 · A DECLARED-UNAVAILABLE PANE IS EXCLUDED, NOT WITHHELD ───────────────────────────────────
// The polarity side-eye caught on every Home run: `SURFACE-AXIS panel-list … withheld(docked=1 overlay=1)`
// and `panel-list-axis=NO-VERDICT` on a section whose definition says `panels: { list: "unavailable",
// context: "unavailable" }` — WITHHELD means "the rule applies and the instrument could not judge it", so
// the run published three axes no arm could ever close beside `population-verdict=complete`. The SAME tool
// asked to reach those states refuses correctly and loudly (`--panels both-docked` → exit 2). What was
// missing was proof: the ruling that unvisited modes are WITHHELD "never guessed into excluded" SURVIVES —
// its INPUT changed, because the shell now PUBLISHES the declaration (`data-panel-available`) and the
// census reads it rather than inferring it.
const paneless = (overrides: Partial<ShellStateSnapshot> = {}): ShellStateSnapshot =>
  shell({
    panels: [
      { side: "list", mode: "collapsed", available: false },
      { side: "context", mode: "collapsed", available: false },
    ],
    ...overrides,
  });

test("#1122 a section that declares BOTH panes unavailable EXCLUDES both panel axes — the reached verdict, not NO-VERDICT", () => {
  const accounting = buildSurfaceStateAccounting(paneless(), "rest");

  for (const census of [accounting.panelList, accounting.panelContext]) {
    expect(census.judged).toBe(0);
    expect(census.withheld).toEqual({});
    expect(census.excluded).toEqual({ sectionDeclaresNoPane: PANEL_MODE_SPACE.length });
    expect(surfaceStateAxisLabel(census)).toBe("excluded");
  }
});

test("#1122 …and FOCUS goes with them: on a section with zero panes the shell ships no focus toggle at all", () => {
  const accounting = buildSurfaceStateAccounting(paneless(), "rest");
  expect(accounting.focus.judged).toBe(0);
  expect(accounting.focus.excluded).toEqual({ sectionDeclaresNoPanes: FOCUS_STATE_SPACE.length });
  expect(surfaceStateAxisLabel(accounting.focus)).toBe("excluded");
});

// THE PLANTED CONTROL IN THE OTHER DIRECTION — without it, "excluded" would also pass on a tree where the
// withheld arm had simply been deleted. A section that DOES declare the pane and was not driven into the
// other modes still reports WITHHELD, and one available pane is enough to put FOCUS back in play.
test("#1122 CONTROL: a section that DOES declare the pane still WITHHOLDS the modes this run did not visit", () => {
  const accounting = buildSurfaceStateAccounting(shell(), "rest");
  expect(accounting.panelList.excluded).toEqual({});
  expect(accounting.panelList.withheld).toEqual({ collapsed: 1, overlay: 1 });
  expect(surfaceStateAxisLabel(accounting.panelList)).toBe("withheld");
  expect(surfaceStateAxisLabel(accounting.focus)).toBe("withheld");
});

test("#1122 CONTROL: ONE declared pane excludes only ITS OWN axis — the twin and focus stay withheld", () => {
  const accounting = buildSurfaceStateAccounting(
    shell({
      panels: [
        { side: "list", mode: "collapsed", available: false },
        { side: "context", mode: "docked", available: true },
      ],
    }),
    "rest",
  );

  expect(accounting.panelList.excluded).toEqual({ sectionDeclaresNoPane: PANEL_MODE_SPACE.length });
  expect(accounting.panelContext.excluded).toEqual({});
  expect(accounting.panelContext.judged).toBe(1);
  expect(surfaceStateAxisLabel(accounting.focus)).toBe("withheld");
});

// An UNPUBLISHED declaration is a BROKEN PUBLISH, not an inapplicability: this builder is pure and total,
// so it keeps the conservative WITHHELD arm, and the loud exit-2 refusal for that input lives at the seam
// that reads the bridge (ops/page-validate.ts, pinned in its own spec).
test("#1122 an UNPUBLISHED declaration is never read as unavailable — it stays WITHHELD", () => {
  const accounting = buildSurfaceStateAccounting(
    shell({
      panels: [
        { side: "list", mode: "collapsed", available: null },
        { side: "context", mode: "collapsed", available: null },
      ],
    }),
    "rest",
  );
  expect(accounting.panelList.excluded).toEqual({});
  expect(surfaceStateAxisLabel(accounting.panelList)).toBe("withheld");
  expect(surfaceStateAxisLabel(accounting.focus)).toBe("withheld");
});

// THE RESULT-LINE HALF OF THE SAME POLARITY. `NO-VERDICT` belongs to WITHHELD alone — an excluded axis
// REACHED its verdict ("the space is inapplicable"), and it is not folded into `complete` either, which
// would claim this run visited every configuration in a space that has none.
test("#1122 the RESULT line prints NO-VERDICT only for WITHHELD; excluded and complete are their own words", () => {
  const rows = new Map(surfaceStateRows(paneless(), buildSurfaceStateAccounting(paneless(), "rest"), "rest"));
  expect(rows.get("panel-list-axis")).toBe("excluded");
  expect(rows.get("panel-context-axis")).toBe("excluded");
  expect(rows.get("focus-axis")).toBe("excluded");
  expect(rows.get("drive-axis")).toBe("NO-VERDICT");

  const measured = shell();
  const measuredRows = new Map(surfaceStateRows(measured, buildSurfaceStateAccounting(measured, "rest"), "rest"));
  expect(measuredRows.get("panel-list-axis")).toBe("NO-VERDICT");
  expect(measuredRows.get("focus-axis")).toBe("NO-VERDICT");
});

// THE PRINTED LINE ITSELF, captured off stdout rather than re-derived — the reviewer reads the console,
// so the console is what this pins. The receipt the #1122 fix owes verbatim:
// `SURFACE-AXIS panel-list candidates=3 judged=0 withheld() excluded(sectionDeclaresNoPane=3) - excluded`.
function capturedSurfaceStateLines(shellState: ShellStateSnapshot): string[] {
  const lines: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string): boolean => {
    lines.push(chunk);
    return true;
  }) as typeof process.stdout.write;
  try {
    printSurfaceState(shellState, buildSurfaceStateAccounting(shellState, "rest"), "rest");
  } finally {
    process.stdout.write = original;
  }
  return lines.join("").split("\n");
}

test("#1122 the printed SURFACE-AXIS lines name the exclusion and its count, with the withheld control beside them", () => {
  const paneLess = capturedSurfaceStateLines(paneless());
  expect(
    paneLess.some((line) => line.includes("SURFACE-AXIS panel-list") && line.includes("excluded(sectionDeclaresNoPane=3)") && line.endsWith("excluded")),
  ).toBe(true);
  expect(paneLess.some((line) => line.includes("SURFACE-AXIS focus") && line.includes("excluded(sectionDeclaresNoPanes=2)") && line.endsWith("excluded"))).toBe(
    true,
  );
  // No axis on a pane-less section may still say "withheld(...)" with a count in it.
  expect(paneLess.filter((line) => line.startsWith("SURFACE-AXIS panel")).every((line) => line.includes("withheld()"))).toBe(true);

  // THE CONTROL: an ordinary section still prints the withheld census, so this is not "excluded always".
  const measured = capturedSurfaceStateLines(shell());
  expect(
    measured.some((line) => line.includes("SURFACE-AXIS panel-list") && line.includes("withheld(collapsed=1 overlay=1)") && line.endsWith("withheld")),
  ).toBe(true);
});
