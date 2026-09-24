// The whole-run verify queue behind a stuck holder. Which runs queue at all is pinned in
// tests/tooling/verify/ops/run.int.test.ts; this file pins that waiters past the ceiling start one at a time.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import type { HostSlotLease } from "../../../../tooling/src/verify/contract/host-slots.ts";
import { HOST_POOL_ROOT_ENV } from "../../../../tooling/src/verify/lib/host-slots.ts";
import type { Parsed } from "../../../../tooling/src/verify/lib/run-argv.ts";
import { parse } from "../../../../tooling/src/verify/lib/run-argv.ts";
import { enterWholeRunQueue } from "../../../../tooling/src/verify/lib/whole-run-queue.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function wholeRun(argv: readonly string[]): Parsed {
  const parsed = parse(argv);
  if ("error" in parsed) {
    throw new Error(`argv ${argv.join(" ")} did not parse: ${parsed.error}`);
  }
  return parsed;
}

// Each poll moves the shared clock well under the queue's heartbeat window, so the waiters stay live
// while the whole-run ceiling passes within a few hundred polls.
const CLOCK_STEP_MS = 8000;
const MACROTASKS_PER_CHECK = 3000;

test("two whole runs queued behind a stuck battery start one at a time, in arrival order", async () => {
  const env = { [HOST_POOL_ROOT_ENV]: mkdtempSync(join(tmpdir(), "orb-whole-run-queue-")) };
  const stuck = await enterWholeRunQueue(process.cwd(), wholeRun(["--push"]), { env, pid: 41_001, alive: (pid) => pid === 41_001 });
  expect(stuck?.slot, "the stuck battery holds the host slot").toBe(1);

  let clockMs = 9_000_000;
  const alive = (pid: number): boolean => [41_001, 41_002, 41_003].includes(pid);
  const admitted: number[] = [];
  const leases = new Map<number, HostSlotLease | null>();
  const pending = [41_002, 41_003].map((pid) =>
    enterWholeRunQueue(process.cwd(), wholeRun(["--static"]), {
      env,
      pid,
      alive,
      now: () => new Date(clockMs),
      sleep: async (ms) => {
        clockMs += ms + CLOCK_STEP_MS;
        await new Promise<void>((resolve) => setImmediate(resolve));
      },
      onQueued: () => undefined,
      onNotice: () => undefined,
    }).then((lease) => {
      admitted.push(pid);
      leases.set(pid, lease);
    }),
  );
  const settle = async (): Promise<void> => {
    for (let i = 0; i < MACROTASKS_PER_CHECK; i += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  };

  await settle();
  expect(admitted, "past the ceiling only the first waiter starts; the second stays queued").toStrictEqual([41_002]);
  expect(leases.get(41_002)?.slot, "it runs as the overflow run, beside the stuck battery").toBeNull();
  leases.get(41_002)?.release();
  await settle();
  expect(admitted, "the second waiter starts once the first finishes").toStrictEqual([41_002, 41_003]);
  await Promise.all(pending);
  leases.get(41_003)?.release();
  stuck?.release();
  rmSync(env[HOST_POOL_ROOT_ENV], { recursive: true, force: true });
});
