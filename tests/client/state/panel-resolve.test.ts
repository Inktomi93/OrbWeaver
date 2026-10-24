import type { PanelMode, PanelName } from "@orb/client/state";
import { resolvePanelMode } from "@orb/client/state";
import { expect, test } from "@orb/testkit/node";

type Regime = Parameters<typeof resolvePanelMode>[2];

const WIDE: Regime = { isMobile: false, isNarrow: false, openOverlayPanel: null, listIsScreen: false };
const NARROW: Regime = { ...WIDE, isNarrow: true };
const MOBILE: Regime = { ...WIDE, isMobile: true };

const PANELS: readonly PanelName[] = ["list", "context"];
const DEFAULTS: readonly PanelMode[] = ["docked", "overlay", "collapsed"];

test("wide resolves the raw override-or-default untouched, for every panel", () => {
  for (const panel of PANELS) {
    for (const resolved of DEFAULTS) {
      expect(resolvePanelMode(panel, resolved, WIDE)).toBe(resolved);
    }
  }
});

test("narrow desktop closes a docked default and opens it to overlay only when named", () => {
  expect(resolvePanelMode("list", "docked", NARROW)).toBe("collapsed");
  expect(resolvePanelMode("list", "docked", { ...NARROW, openOverlayPanel: "list" })).toBe("overlay");
  // A request for the other panel does not open this one.
  expect(resolvePanelMode("list", "docked", { ...NARROW, openOverlayPanel: "context" })).toBe("collapsed");
});

test("narrow desktop: being named wins over a stored collapse", () => {
  expect(resolvePanelMode("context", "collapsed", { ...NARROW, openOverlayPanel: "context" })).toBe("overlay");
});

test("an explicit collapsed or overlay value passes through narrow identically to wide", () => {
  for (const resolved of ["collapsed", "overlay"] as const) {
    expect(resolvePanelMode("list", resolved, NARROW)).toBe(resolved);
    expect(resolvePanelMode("list", resolved, WIDE)).toBe(resolved);
  }
});

test("mobile never resolves docked from a default: a sheet is open only when named", () => {
  for (const resolved of DEFAULTS) {
    expect(resolvePanelMode("list", resolved, MOBILE)).toBe("collapsed");
    expect(resolvePanelMode("context", resolved, { ...MOBILE, openOverlayPanel: "context" })).toBe("overlay");
    expect(resolvePanelMode("context", resolved, { ...MOBILE, openOverlayPanel: "list" })).toBe("collapsed");
  }
});

test("mobile outranks narrow when both hold", () => {
  expect(resolvePanelMode("list", "docked", { ...MOBILE, isNarrow: true })).toBe("collapsed");
  expect(resolvePanelMode("list", "docked", { ...MOBILE, isNarrow: true, openOverlayPanel: "list" })).toBe("overlay");
});

test("mobile list-as-screen docks the list unless the user closed it with none", () => {
  const screen: Regime = { ...MOBILE, listIsScreen: true };
  expect(resolvePanelMode("list", "collapsed", screen)).toBe("docked");
  expect(resolvePanelMode("list", "collapsed", { ...screen, openOverlayPanel: "none" })).toBe("collapsed");
  // A request for the context sheet leaves the roster as the screen beneath it.
  expect(resolvePanelMode("list", "collapsed", { ...screen, openOverlayPanel: "context" })).toBe("docked");
});

test("list-as-screen never docks the context panel", () => {
  expect(resolvePanelMode("context", "docked", { ...MOBILE, listIsScreen: true })).toBe("collapsed");
});

test("listIsScreen is inert off mobile", () => {
  expect(resolvePanelMode("list", "collapsed", { ...WIDE, listIsScreen: true })).toBe("collapsed");
  expect(resolvePanelMode("list", "docked", { ...NARROW, listIsScreen: true })).toBe("collapsed");
});
