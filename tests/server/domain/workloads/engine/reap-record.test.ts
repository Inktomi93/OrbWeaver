// engine/reap-record — the shared reap SENTENCE. `markTerminal` overwrites `updatedAt` (the lease column)
// with the reap instant, so this string is the row's ONLY surviving evidence of WHICH death it was: the
// steady-state sweep, a boot restart, or a respawn loop. These pin that the three stay DISTINGUISHABLE and
// that each carries the observed lease age — collapsing them back into one line is the forensics regression
// (#560/#543) the shared leaf exists to prevent.

import type { WorkloadReapReason } from "../../../../../packages/server/src/domain/workloads/contract/service.ts";
import { MAX_BOOT_RESPAWNS, reapedMessage } from "../../../../../packages/server/src/domain/workloads/engine/reap-record.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const LEASE_AGE_MS = 91_000;
const REASONS: readonly WorkloadReapReason[] = ["heartbeat_stale", "worker_restart", "respawn_loop"];

test("every reap reason yields a DISTINCT sentence — the whole point of the shared dispatch", () => {
  const sentences = REASONS.map((reason) => reapedMessage(reason, LEASE_AGE_MS));

  expect(new Set(sentences).size).toBe(REASONS.length);
});

test("every sentence carries the lease age observed BEFORE the terminal stamp overwrote it", () => {
  for (const reason of REASONS) {
    expect(reapedMessage(reason, LEASE_AGE_MS), reason).toContain(`${LEASE_AGE_MS}ms`);
  }
});

test("each sentence names its own death: a stale heartbeat, a restart, or a burned respawn bound", () => {
  expect(reapedMessage("heartbeat_stale", LEASE_AGE_MS)).toContain("heartbeat went stale");
  expect(reapedMessage("worker_restart", LEASE_AGE_MS)).toContain("the server restarted");

  const looped = reapedMessage("respawn_loop", LEASE_AGE_MS);
  // The bound is READ from the constant the boot reclaim branches on — a sentence quoting a different number
  // than the code enforces is exactly the forensic lie this module exists to prevent.
  expect(looped).toContain(`respawned ${MAX_BOOT_RESPAWNS} times`);
  expect(looped).toContain("rather than re-queued again");
});

test("an unknown reason is UNREACHABLE and says so — the assertNever arm, not a silent default sentence", () => {
  // The compile-time exhaustiveness is tsc's; this pins the RUNTIME half, which is what a wire/db value
  // outside the union would actually hit. FABRICATION-OK: a deliberate invalid-input probe of the arm.
  expect(() => reapedMessage("relocated_to_mars" as WorkloadReapReason, LEASE_AGE_MS)).toThrow(/unreachable workload reap reason/u);
});
