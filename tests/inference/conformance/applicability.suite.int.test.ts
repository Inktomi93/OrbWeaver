// @subject packages/inference/src/index.ts
// @subject packages/inference/src/registry/backends.ts
import { WIRE_DEFS } from "@orb/contracts/inference";

import { expect, test } from "@orb/testkit/node/fixtures.ts";

import { CONFORMANCE_TASKS, CONFORMANCE_WIRES, conformanceRoot, hasDriver, skipReasonFor } from "./runtime.fixtures.ts";

test("every wire is available through the actual production root — no arm may stand in for an unbuilt sibling", async () => {
  await using root = await conformanceRoot();
  const providers = root.app.runtime.providers.available(await root.principalFor(root.ownerId));
  for (const wire of CONFORMANCE_WIRES) {
    const rows = providers.filter((row) => row.provider.wire === wire);
    expect(rows.length, `${wire} is actually listed by the production runtime`).toBeGreaterThan(0);
    expect(
      rows.every((row) => row.available),
      `${wire} is available in the runtime every arm executes through`,
    ).toBe(true);
  }
});

test("a missing served-cell driver is a failure condition, never disguised as an unserved cell", () => {
  expect(skipReasonFor("agent-sdk", "chat")).toBeNull();
  expect(skipReasonFor("agent-sdk", "chat", () => false)).toBe("no-driver");
  expect(skipReasonFor("local-light", "chat", () => false)).toBe("unserved");
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
    "google-generative-ai": ["chat", "embed", "structured"],
    "openai-compat": ["chat", "embed", "structured"],
    "anthropic-messages": ["chat", "structured"],
    "agent-sdk": ["chat", "structured"],
    // Serves neither chat nor structured — its whole conformance surface is `embed`, which is why
    // cancellation derives its probe task per wire instead of assuming chat.
    "local-light": ["embed"],
  });
});
