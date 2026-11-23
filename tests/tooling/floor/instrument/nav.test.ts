// The ONE SPA-navigation vocabulary the browser probes share (tooling/src/floor/instrument/nav.ts). Home per
// Spine-Testing §2: a test of a scripts/ tool lives in tests/tooling/.
//
// WHY IT IS SHARED (2026-08-17, issue #148 item 1): the bridge call was hand-spelled in snap and again in
// design-audit, and motion-audit/perf-meter had no nav at all — so the two probes that answer "is this
// surface smooth / responsive" could not reach any surface behind a room. Four probes, one spelling: a
// probe that arrives differently is a probe measuring something else.

import { expect, test } from "@orb/testkit/tooling";
import { callNavInPage, decodeNavCall, NAV_FLAG_METHOD, NAV_FLAGS } from "@orb/tooling/floor/instrument/nav";

test("each verb calls its own bridge method with the raw target", () => {
  expect(decodeNavCall("open-chat", "latest")).toEqual({ method: "openChat", args: ["latest"] });
  expect(decodeNavCall("open-character", "Aria")).toEqual({ method: "openCharacter", args: ["Aria"] });
  expect(decodeNavCall("context-tab", "rpg.game")).toEqual({ method: "contextTab", args: ["rpg.game"] });
});

test("--panel decodes name=mode into TWO bridge arguments", () => {
  expect(decodeNavCall("panel", "context=collapsed")).toEqual({ method: "panel", args: ["context", "collapsed"] });
  expect(decodeNavCall("panel", "list=docked")).toEqual({ method: "panel", args: ["list", "docked"] });
});

test("--goto is DECODED in Node, so the page receives one concrete method", () => {
  // The bridge does not understand the namespaced spelling; parseGotoTarget (_kit/flags.ts) picks the arm.
  expect(decodeNavCall("goto", "config:appearance")).toEqual({ method: "openConfig", args: ["appearance"] });
  expect(decodeNavCall("goto", "config:appearance.sizing")).toEqual({ method: "openConfig", args: ["appearance", "sizing"] });
  // The THIRD leg (#1176 widened the bridge to `openConfig(group, sub?, setting?)`; #1639 made it
  // reachable from the CLI): without it no probe could ever drive to one setting LEAF.
  expect(decodeNavCall("goto", "config:appearance.sizing.density")).toEqual({ method: "openConfig", args: ["appearance", "sizing", "density"] });
  expect(decodeNavCall("goto", "modal:you")).toEqual({ method: "openModal", args: ["you"] });
  expect(decodeNavCall("goto", "presets")).toEqual({ method: "section", args: ["presets"] });
});

test("--goto REFUSES a config address with a fourth part rather than emitting a call that lands elsewhere", () => {
  // A nav that did not land means the probe is measuring some OTHER surface — the module's own contract.
  // The refusal reaches the caller as a NAV FAILED line + a reddened exit (snap/ops/drive.ts's driveNav).
  expect(() => decodeNavCall("goto", "config:appearance.sizing.density.extra")).toThrow("config:<group>[.<sub>[.<setting>]]");
});

test("a target with quotes reaches the bridge as one argument, never as script text", () => {
  expect(decodeNavCall("open-chat", 'a"); alert(1); ("')).toEqual({ method: "openChat", args: ['a"); alert(1); ("'] });
});

test("a missing bridge answers with a stated reason instead of throwing in-page", async () => {
  // __orb is dev-only; against a prod build the action must FAIL loudly, never silently no-op. This process has no `__orb`.
  const answer = await callNavInPage(decodeNavCall("goto", "presets"));
  expect(answer).toEqual({ ok: false, reason: expect.stringContaining("__orb.nav unavailable") });
});

test("the flag table and the verb union are the same list — a probe cannot offer half of it", () => {
  expect(NAV_FLAGS.map((flag) => NAV_FLAG_METHOD[flag])).toEqual(["goto", "open-chat", "open-character", "context-tab", "panel"]);
});
