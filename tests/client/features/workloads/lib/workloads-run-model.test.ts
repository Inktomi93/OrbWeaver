// Unit: the run dialog's DEFERRAL + DAG vocabulary (features/workloads/lib/workloads-run-model). Pure, no DOM.
// Guards the datetime→scheduledAt parse (omit when empty/bad), the clock-free queue-state derivations the
// LIST renders (deferred = queued + future scheduledAt; waiting = queued + deps; dependency_failed = the DAG
// terminal keyed on the server message fragment), and the plural wait label.

import {
  dependencyWaitLabel,
  isDeferredWorkload,
  isDependencyFailure,
  isWaitingOnDependencies,
  parseRunAt,
} from "../../../../../packages/client/src/features/workloads/lib/workloads-run-model";
import { expect, test } from "../../../../support/fixtures";

test("parseRunAt: empty/unparseable → undefined (run now); a valid datetime-local → epoch ms", () => {
  expect(parseRunAt("")).toBeUndefined();
  expect(parseRunAt("not-a-date")).toBeUndefined();
  const ms = parseRunAt("2099-01-01T03:30");
  expect(typeof ms).toBe("number");
  // Round-trips back to the same wall-clock components (local tz) — a real future instant, not NaN.
  expect(ms).toBe(new Date("2099-01-01T03:30").getTime());
});

test("isDeferredWorkload: queued + scheduledAt well past createdAt; not for a near/non-deferred or non-queued row", () => {
  const createdAt = 1_750_000_000_000;
  // A user-deferred run: scheduledAt minutes+ ahead of createdAt.
  expect(isDeferredWorkload({ status: "queued", createdAt, scheduledAt: createdAt + 600_000 })).toBe(true);
  // A normal run: scheduledAt ≈ createdAt (within the insert-latency lead) → NOT deferred.
  expect(isDeferredWorkload({ status: "queued", createdAt, scheduledAt: createdAt + 5 })).toBe(false);
  // Already running (fired) → not a pending deferred row even if scheduledAt was future.
  expect(isDeferredWorkload({ status: "running", createdAt, scheduledAt: createdAt + 600_000 })).toBe(false);
});

test("isWaitingOnDependencies: queued + non-empty dependsOn only", () => {
  expect(isWaitingOnDependencies({ status: "queued", dependsOn: ["workload_a"] })).toBe(true);
  expect(isWaitingOnDependencies({ status: "queued", dependsOn: [] })).toBe(false);
  expect(isWaitingOnDependencies({ status: "queued", dependsOn: null })).toBe(false);
  // A running row with deps is past the gate (deps satisfied) — not "waiting".
  expect(isWaitingOnDependencies({ status: "running", dependsOn: ["workload_a"] })).toBe(false);
});

test("dependencyWaitLabel: singular vs plural", () => {
  expect(dependencyWaitLabel(1)).toBe("Waiting on 1 dependency");
  expect(dependencyWaitLabel(3)).toBe("Waiting on 3 dependencies");
});

test("isDependencyFailure: matches the server dependency_failed message, not a normal runtime failure", () => {
  expect(isDependencyFailure("a dependency did not succeed (a non-success terminal, or an absent dependency) — the dependent cannot run")).toBe(true);
  expect(isDependencyFailure("runtime: provider unreachable")).toBe(false);
  expect(isDependencyFailure(null)).toBe(false);
});
