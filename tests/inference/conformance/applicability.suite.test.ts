// CONFORMANCE — APPLICABILITY. The pin that stops this whole suite from rotting into decoration.
//
// THE FAILURE MODE IT EXISTS TO PREVENT. A conformance arm that does not run reads, in a report, EXACTLY
// like one that ran and passed. So the suite's real risk was never a wrong assertion — it was a cell that
// stopped executing because a fixture went missing, or because a wire's `needs` quietly stopped being
// satisfied, while the row still rendered as "skipped" among a wall of ticks nobody re-counted. This file
// makes every such skip a FAILURE, and leaves exactly one admissible reason: the wire does not serve the
// task, which is a fact `WIRE_DEFS` states and not a fact about the harness.
//
// APPLICABILITY IS DERIVED, EVERYWHERE. `skipReasonFor(wire, task)` reads `WIRE_DEFS[wire].serves` and
// `BACKEND_DEFS[wire].needs(deps)`. No behaviour file carries a "these wires apply" list, so a wire that
// grows a served task joins every matrix by existing, and one that loses a driver cannot fall out quietly.
//
// WHAT THESE PINS WOULD CATCH
//  · Delete a driver and the coverage pin names the (wire, task) cell as `no-driver` — before, that cell
//    would simply have stopped asserting anything.
//  · Add a wire to `WIRES` without a fixture and the same pin reds, rather than the new backend shipping
//    with a fully green conformance suite that never touched it.
//  · Let a `needs` predicate grow a requirement the harness does not satisfy and the BUILD pin reds with the
//    missing need named, rather than three wires silently standing in for four.

import type { Wire } from "@orb/contracts/inference";
import { WIRE_DEFS } from "@orb/contracts/inference";
import { BACKEND_DEFS, buildBackends } from "../../../packages/inference/src/registry/backends.ts";
import { expect, test } from "../../support/fixtures.ts";
import { fakeDeps } from "../_support.ts";
import { CLAUDE_EXECUTABLE, CONFORMANCE_TASKS, CONFORMANCE_WIRES, conformanceNeedsMissing, hasDriver, skipReasonFor } from "./_harness.ts";

test("every wire BUILDS under the conformance deps — no arm may stand in for an unbuilt sibling", () => {
  const built = buildBackends(fakeDeps({ claudeExecutable: CLAUDE_EXECUTABLE }));
  expect([...built.skipped.entries()], "a wire the conformance posture failed to build").toEqual([]);
  for (const wire of CONFORMANCE_WIRES) {
    expect(built.registry.has(wire), `${wire} is in the registry every arm dispatches through`).toBe(true);
  }
});

test("the `unbuilt` limb is LIVE, not dead code — the positive control on the skip classifier", () => {
  // Without this, `skipReasonFor` could have lost the ability to say `unbuilt` at all and every assertion in
  // this file would still pass. `BACKEND_DEFS["agent-sdk"].needs` is the one predicate that can refuse.
  const withoutRuntime = buildBackends(fakeDeps({}));
  expect([...withoutRuntime.skipped.keys()], "exactly the agent-sdk wire needs the bundled runtime").toEqual<Wire[]>(["agent-sdk"]);
  expect(BACKEND_DEFS["agent-sdk"].needs(fakeDeps({})), "and it names the missing need").toContain("claudeExecutable");
  expect(conformanceNeedsMissing("agent-sdk"), "…while the conformance posture satisfies it").toBeNull();
});

test("EVERY conformance cell either runs or is unserved — a missing driver is a failure, never a quiet skip", () => {
  const offenders: string[] = [];
  const cells: string[] = [];
  for (const wire of CONFORMANCE_WIRES) {
    for (const task of CONFORMANCE_TASKS) {
      const reason = skipReasonFor(wire, task);
      cells.push(`${wire}/${task}=${reason ?? "runs"}`);
      if (reason !== null && reason !== "unserved") {
        offenders.push(`${wire}/${task}: ${reason}`);
      }
    }
  }
  expect(offenders, "a conformance cell skipped for a reason other than WIRE_DEFS.serves").toEqual([]);
  // The measurement's own receipt: a zero above is only meaningful beside a non-zero cell count.
  expect(cells.length, "the matrix was actually walked").toBe(CONFORMANCE_WIRES.length * CONFORMANCE_TASKS.length);
  expect(cells.filter((cell) => cell.endsWith("=runs")).length, "the matrix has running cells, not only skips").toBeGreaterThan(0);
});

test("the driver table covers exactly WIRE_DEFS[wire].serves ∩ CONFORMANCE_TASKS, per wire", () => {
  const coverage: Record<string, string[]> = {};
  for (const wire of CONFORMANCE_WIRES) {
    const served = CONFORMANCE_TASKS.filter((task) => WIRE_DEFS[wire].serves.includes(task));
    const driven = CONFORMANCE_TASKS.filter((task) => hasDriver(wire, task));
    // The two must agree. A wire that serves a conformance task with no driver is the `no-driver` gap above;
    // a driver for a task the wire does not serve would be an arm asserting against a typed refusal while
    // reading like real coverage.
    expect(driven.toSorted(), `${wire}: drivers vs WIRE_DEFS.serves`).toEqual(served.toSorted());
    coverage[wire] = served.toSorted();
  }
  // Pinned so the SHAPE of the matrix is legible in one place and a change to any wire's `serves` shows up
  // here as a diff rather than as a silently smaller run.
  expect(coverage).toEqual({
    "openai-compat": ["chat", "embed", "structured"],
    "anthropic-messages": ["chat", "structured"],
    "agent-sdk": ["chat", "structured"],
    // Serves neither chat nor structured — its whole conformance surface is `embed`, which is why
    // cancellation derives its probe task per wire instead of assuming chat.
    "local-light": ["embed"],
  });
});
