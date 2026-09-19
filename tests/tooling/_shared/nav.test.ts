// The ONE SPA-navigation vocabulary the browser probes share (tooling/src/_shared/nav.ts). Home per
// Spine-Testing §2: a test of a scripts/ tool lives in tests/tooling/.
//
// WHY IT IS SHARED (2026-08-17, issue #148 item 1): the bridge call was hand-spelled in snap and again in
// design-audit, and motion-audit/perf-meter had no nav at all — so the two probes that answer "is this
// surface smooth / responsive" could not reach any surface behind a room. Four probes, one spelling: a
// probe that arrives differently is a probe measuring something else.
import { buildNavScript, NAV_FLAG_METHOD, NAV_FLAGS } from "@orb/tooling/_shared/nav";
import { expect, test } from "../../support/tool-fixtures.ts";

test("each verb calls its own bridge method with the raw target", () => {
  expect(buildNavScript("open-chat", "latest")).toContain('nav.openChat("latest")');
  expect(buildNavScript("open-character", "Aria")).toContain('nav.openCharacter("Aria")');
  expect(buildNavScript("context-tab", "rpg.game")).toContain('nav.contextTab("rpg.game")');
});

test("--panel decodes name=mode into TWO bridge arguments", () => {
  expect(buildNavScript("panel", "context=collapsed")).toContain('nav.panel("context", "collapsed")');
  expect(buildNavScript("panel", "list=docked")).toContain('nav.panel("list", "docked")');
});

test("--focus decodes on|off into a bridge boolean", () => {
  expect(buildNavScript("focus", "on")).toContain("nav.focus(true)");
  expect(buildNavScript("focus", "off")).toContain("nav.focus(false)");
});

test("--goto is DECODED in Node, so the emitted script names one concrete method", () => {
  // The bridge does not understand the namespaced spelling; parseGotoTarget (_kit/flags.ts) picks the arm.
  expect(buildNavScript("goto", "config:appearance")).toContain('nav.openConfig("appearance")');
  expect(buildNavScript("goto", "config:appearance.sizing")).toContain('nav.openConfig("appearance", "sizing")');
  // The THIRD leg (#1176 widened the bridge to `openConfig(group, sub?, setting?)`; #1639 made it
  // reachable from the CLI): without it no probe could ever drive to one setting LEAF.
  expect(buildNavScript("goto", "config:appearance.sizing.density")).toContain('nav.openConfig("appearance", "sizing", "density")');
  expect(buildNavScript("goto", "modal:you")).toContain('nav.openModal("you")');
  expect(buildNavScript("goto", "presets")).toContain('nav.section("presets")');
});

test("--goto REFUSES a config address with a fourth part rather than emitting a call that lands elsewhere", () => {
  // A nav that did not land means the probe is measuring some OTHER surface — the module's own contract.
  // The refusal reaches the caller as a NAV FAILED line + a reddened exit (snap/ops/drive.ts's driveNav).
  expect(() => buildNavScript("goto", "config:appearance.sizing.density.extra")).toThrow("config:<group>[.<sub>[.<setting>]]");
});

test("a target with quotes cannot break out of the emitted call", () => {
  expect(buildNavScript("open-chat", 'a"); alert(1); ("')).toContain(String.raw`nav.openChat("a\"); alert(1); (\"")`);
});

test("a missing bridge answers with a stated reason instead of throwing in-page", () => {
  // __orb is dev-only; against a prod build the action must FAIL loudly, never silently no-op.
  expect(buildNavScript("goto", "presets")).toContain("__orb.nav unavailable");
});

test("the flag table and the verb union are the same list — a probe cannot offer half of it", () => {
  expect(NAV_FLAGS.map((flag) => NAV_FLAG_METHOD[flag])).toEqual(["goto", "open-chat", "open-character", "context-tab", "panel", "focus"]);
});
