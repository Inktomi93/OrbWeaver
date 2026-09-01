// The `--panels` preset home (tooling/src/_shared/panel-flags.ts + panel-presets.json). Home per
// Spine-Testing §2: a test of a tooling module lives in tests/tooling/.
//
// The COMMITTED ROWS are pinned here against the vocabulary the app itself owns
// (packages/client/src/agent-nav/panel-request.ts: names list|context, writable modes docked|collapsed,
// focus on|off). That vocabulary deliberately has no second home in tooling — the bridge refuses an unknown
// value loudly at run time — so this suite is what stops a typo in the committed JSON from reaching a live
// run as a nav error nobody expected.

import type { PanelPresetAction } from "@orb/tooling/_shared/panel-flags";
import { applyPanelPresetFlag, loadPanelPreset, PANEL_PRESET_VALUE_FLAGS, panelPresetHelpBlock, panelPresetNames } from "@orb/tooling/_shared/panel-flags";
import { expect, test } from "../../support/tool-fixtures.ts";

/** The app's own panel vocabulary, restated as the ORACLE this suite judges the committed rows against. */
const PANEL_NAMES = ["list", "context"];
const PANEL_WRITABLE_MODES = ["docked", "collapsed"];

/** A profile's actions, or a THROW naming it — so every assertion below is unconditional (a conditional
 *  expect is a test that can pass by never running the check). */
function actionsOf(name: string): readonly PanelPresetAction[] {
  const parsed = loadPanelPreset(name);
  if ("error" in parsed) {
    throw new Error(`panel preset "${name}" did not load: ${parsed.error}`);
  }
  return parsed.actions;
}

function panelTargets(name: string): readonly string[] {
  return actionsOf(name)
    .filter((action) => action.method === "panel")
    .map((action) => action.target);
}

test("every committed profile expands into targets the app's nav bridge can actually accept", () => {
  const names = panelPresetNames();
  expect(names).toEqual(["both-docked", "list-only", "context-only", "focus"]);

  const rows = names.flatMap((name) => actionsOf(name).map((action) => ({ name, ...action })));
  expect(rows.length).toBeGreaterThan(0);
  const illegal = rows.filter((row) => {
    if (row.method === "focus") {
      return row.target !== "on" && row.target !== "off";
    }
    const [panel, mode] = row.target.split("=");
    return row.method !== "panel" || !PANEL_NAMES.includes(panel ?? "") || !PANEL_WRITABLE_MODES.includes(mode ?? "");
  });
  expect(illegal).toEqual([]);
});

test("a panel profile clears focus BEFORE it writes a mode — a docked request under focusMode cannot land", () => {
  // focusMode outranks the panel overrides in resolvePanelMode, so a profile that skipped this would refuse
  // on any run that had previously focused, and would do it for a reason the command line does not name.
  const leads = ["both-docked", "list-only", "context-only"].map((name) => actionsOf(name)[0]);
  expect(leads).toEqual([
    { method: "focus", target: "off" },
    { method: "focus", target: "off" },
    { method: "focus", target: "off" },
  ]);
});

test("the panel-carrying profiles state BOTH panes — a preset is a configuration, not a patch", () => {
  expect(panelTargets("both-docked")).toEqual(["list=docked", "context=docked"]);
  expect(panelTargets("list-only")).toEqual(["list=docked", "context=collapsed"]);
  expect(panelTargets("context-only")).toEqual(["list=collapsed", "context=docked"]);
  // focus resolves both panes itself (shell-store.ts), so writing one would be a request that cannot land.
  expect(panelTargets("focus")).toEqual([]);
  expect(actionsOf("focus")).toEqual([{ method: "focus", target: "on" }]);
});

test("an unknown profile is a stated reason naming the valid ones, never an empty expansion", () => {
  expect(loadPanelPreset("both")).toEqual({ error: '--panels "both" is not a profile — valid: both-docked, list-only, context-only, focus' });
});

test("applyPanelPresetFlag routes a refusal to errors and queues NOTHING", () => {
  const errors: string[] = [];
  const queued: PanelPresetAction[] = [];
  applyPanelPresetFlag(loadPanelPreset("nope"), errors, (action) => queued.push(action));

  expect(errors).toHaveLength(1);
  expect(queued).toEqual([]);
});

test("applyPanelPresetFlag enqueues the profile's actions IN FILE ORDER", () => {
  const errors: string[] = [];
  const queued: PanelPresetAction[] = [];
  applyPanelPresetFlag(loadPanelPreset("context-only"), errors, (action) => queued.push(action));

  expect(errors).toEqual([]);
  expect(queued).toEqual([
    { method: "focus", target: "off" },
    { method: "panel", target: "list=collapsed" },
    { method: "panel", target: "context=docked" },
  ]);
});

test("the axis advertises its ONE home, its composition rule, and its refusal polarity", () => {
  expect(PANEL_PRESET_VALUE_FLAGS).toEqual(["--panels"]);
  const help = panelPresetHelpBlock();
  expect(help).toContain("tooling/src/_shared/panel-presets.json");
  expect(help).toContain("both-docked | list-only | context-only | focus");
  expect(help).toContain("composes over it");
  expect(help).toContain("REFUSES loudly");
});
