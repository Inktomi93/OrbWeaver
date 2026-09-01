// The panel-axis census (tooling/src/ui-audit/lib/surface-state.ts): design-audit reads exactly ONE
// shell configuration per run, so this pins the three arms that must never silently disagree —
// a genuinely mounted shell measures the one it saw and WITHHOLDS the rest of the space by name; an
// unmounted shell (no `.shell-grid` — landing/auth, or a boot still in flight) proves the whole axis
// EXCLUDED rather than guessing; a mounted shell missing one side entirely (should not happen — both
// `PanelChrome`s render unconditionally) excludes only that one side under its own reason.
import type { ShellStateSnapshot } from "../../../../tooling/src/ui-audit/index.ts";
import { buildSurfaceStateAccounting, FOCUS_STATE_SPACE, PANEL_MODE_SPACE, surfaceStateAxisLabel } from "../../../../tooling/src/ui-audit/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function shell(overrides: Partial<ShellStateSnapshot> = {}): ShellStateSnapshot {
  return {
    section: "home",
    panels: [
      { side: "list", mode: "docked" },
      { side: "context", mode: "collapsed" },
    ],
    chatOpen: false,
    focus: false,
    ...overrides,
  };
}

test("a mounted shell judges exactly the observed mode and withholds the rest of the space by name", () => {
  const accounting = buildSurfaceStateAccounting(shell());

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
  const accounting = buildSurfaceStateAccounting(shell({ focus: true }));
  expect(accounting.focus.withheld).toEqual({ off: 1 });
});

test("no shell mounted at all EXCLUDES every axis wholesale — a proven fact, not a guess", () => {
  const accounting = buildSurfaceStateAccounting(null);

  for (const census of [accounting.panelList, accounting.panelContext, accounting.focus]) {
    expect(census.judged).toBe(0);
    expect(census.withheld).toEqual({});
  }
  expect(accounting.panelList.excluded).toEqual({ "no-shell-mounted": PANEL_MODE_SPACE.length });
  expect(accounting.focus.excluded).toEqual({ "no-shell-mounted": FOCUS_STATE_SPACE.length });
});

test("a shell snapshot with an empty section and no panels is treated as unmounted", () => {
  const accounting = buildSurfaceStateAccounting(shell({ section: null, panels: [] }));
  expect(accounting.panelList.excluded).toEqual({ "no-shell-mounted": PANEL_MODE_SPACE.length });
});

test("a mounted shell missing one side's panel entry excludes ONLY that side, under its own reason", () => {
  const accounting = buildSurfaceStateAccounting(shell({ panels: [{ side: "list", mode: "docked" }] }));

  expect(accounting.panelList.judged).toBe(1);
  expect(accounting.panelList.excluded).toEqual({});
  expect(accounting.panelContext.judged).toBe(0);
  expect(accounting.panelContext.withheld).toEqual({});
  expect(accounting.panelContext.excluded).toEqual({ "panel-not-rendered": PANEL_MODE_SPACE.length });
});

test("axis labels: withheld for the ordinary single-run case, excluded when the whole space is inapplicable", () => {
  const measured = buildSurfaceStateAccounting(shell());
  expect(surfaceStateAxisLabel(measured.panelList)).toBe("withheld");

  const unmounted = buildSurfaceStateAccounting(null);
  expect(surfaceStateAxisLabel(unmounted.panelList)).toBe("excluded");
});

test("every axis's own accounting settles under assertCensusAccounting's invariant — candidates = judged + withheld + excluded", () => {
  for (const snapshot of [shell(), shell({ focus: true }), null, shell({ panels: [] })]) {
    const accounting = buildSurfaceStateAccounting(snapshot);
    for (const census of [accounting.panelList, accounting.panelContext, accounting.focus]) {
      const withheldTotal = Object.values(census.withheld).reduce((a, b) => a + b, 0);
      const excludedTotal = Object.values(census.excluded).reduce((a, b) => a + b, 0);
      expect(census.candidates).toBe(census.judged + withheldTotal + excludedTotal);
    }
  }
});
