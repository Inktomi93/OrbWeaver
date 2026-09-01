// design-audit's `--panels <preset>` axis at the PARSE tier: what the flag expands into, where it lands in
// the argv-ordered queue, and how it composes with the hand-written --panel/--focus flags.
//
// WHY THIS TIER (#148 item 3): the queue IS the behavior. A preset that expanded anywhere other than its own
// argv position would silently reorder a chain (`--goto config --panels focus` would focus the WRONG
// surface), and that reordering is invisible to a live run's own output — the run would simply report a
// state it reached for reasons the command line does not read as. So the ordering is pinned here, in data,
// rather than inferred from a rendered receipt.

import { DESIGN_AUDIT_HELP, parseAuditArgs } from "../../../../tooling/src/ui-audit/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("--panels expands into the panel/focus nav actions of its named profile", () => {
  const args = parseAuditArgs(["/", "--panels", "context-only"]);

  expect(args.errors).toEqual([]);
  expect(args.actions).toEqual([
    { kind: "nav", method: "focus", target: "off" },
    { kind: "nav", method: "panel", target: "list=collapsed" },
    { kind: "nav", method: "panel", target: "context=docked" },
  ]);
});

test("the focus profile writes the focus flag ALONE — focusMode resolves both panels itself", () => {
  // shell-store.ts: focusMode is a regime input to resolvePanelMode ABOVE mobile/narrow. A docked panel
  // request underneath it would not land and would refuse, so a preset that wrote one would be a lying axis.
  expect(parseAuditArgs(["/", "--panels", "focus"]).actions).toEqual([{ kind: "nav", method: "focus", target: "on" }]);
});

test("a preset expands AT ITS ARGV POSITION, so the chain means what it reads as", () => {
  const before = parseAuditArgs(["/", "--panels", "focus", "--goto", "config"]);
  const after = parseAuditArgs(["/", "--goto", "config", "--panels", "focus"]);

  expect(before.actions).toEqual([
    { kind: "nav", method: "focus", target: "on" },
    { kind: "nav", method: "goto", target: "config" },
  ]);
  expect(after.actions).toEqual([
    { kind: "nav", method: "goto", target: "config" },
    { kind: "nav", method: "focus", target: "on" },
  ]);
});

test("an explicit --panel written AFTER a preset composes over it (last write to a pane wins)", () => {
  const args = parseAuditArgs(["/", "--panels", "both-docked", "--panel", "context=collapsed"]);

  expect(args.errors).toEqual([]);
  expect(args.actions.at(-1)).toEqual({ kind: "nav", method: "panel", target: "context=collapsed" });
  // …and the preset's own context write is still in the queue BEFORE it — composition is queue order, not
  // a silent replacement, so the run's action count reports every write it actually performed.
  expect(args.actions).toContainEqual({ kind: "nav", method: "panel", target: "context=docked" });
});

test("--panels refuses an unknown profile and a missing value instead of auditing an unknown layout", () => {
  expect(parseAuditArgs(["/", "--panels", "both-dockd"]).errors).toEqual([
    '--panels "both-dockd" is not a profile — valid: both-docked, list-only, context-only, focus',
  ]);
  expect(parseAuditArgs(["/", "--panels"]).errors).toContain("--panels requires a value");
});

test("--panels is advertised in the help text with its composition rule", () => {
  expect(DESIGN_AUDIT_HELP).toContain("--panels <preset>");
  expect(DESIGN_AUDIT_HELP).toContain("both-docked | list-only | context-only | focus");
  expect(DESIGN_AUDIT_HELP).toContain("REFUSES loudly");
});
