// The whole-run verify queue behind a stuck holder. Which runs queue at all is pinned in
// tests/tooling/verify/ops/run.int.test.ts; this file pins that waiters past the ceiling start one at a time.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import type { HostSlotLease } from "@orb/tooling/_shared/host-slots";
import { HOST_POOL_ROOT_ENV } from "@orb/tooling/_shared/host-slots";
import { parseRequest } from "../../../../tooling/src/verify/lib/run-argv.ts";
import type { WholeRunAsk } from "../../../../tooling/src/verify/lib/whole-run-queue.ts";
import { enterWholeRunQueue } from "../../../../tooling/src/verify/lib/whole-run-queue.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function wholeRun(argv: readonly string[]): WholeRunAsk {
  const parsed = parseRequest(argv);
  if ("error" in parsed) {
    throw new Error(`argv ${argv.join(" ")} did not parse: ${parsed.error}`);
  }
  return { tier: parsed.tier, scoped: parsed.request !== undefined };
}

// Each poll moves the shared clock well under the queue's heartbeat window, so the waiters stay live
// while the whole-run ceiling passes within a few hundred polls.
const CLOCK_STEP_MS = 8000;
const MACROTASKS_PER_CHECK = 6000;

test("two whole runs queued behind a stuck battery start one ceiling apart, in arrival order", async () => {
  const env = { [HOST_POOL_ROOT_ENV]: mkdtempSync(join(tmpdir(), "orb-whole-run-queue-")) };
  const stuck = await enterWholeRunQueue(process.cwd(), wholeRun(["--push"]), { env, pid: 41_001, alive: (pid) => pid === 41_001 });
  expect(stuck?.slot, "the stuck battery holds the host slot").toBe(1);

  let clockMs = 9_000_000;
  const alive = (pid: number): boolean => [41_001, 41_002, 41_003].includes(pid);
  // An admitted run's lease beats on a timer. Here the timer is driven by the shared clock: every poll beats every
  // live lease, as a real timer would across that much time. Without it the overflow run reads as silent, and so
  // dead, one stale window after it starts, and the second waiter takes its file at the first ceiling.
  const beats = new Set<() => void>();
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
        for (const tick of beats) {
          tick();
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
      },
      beat: (tick) => {
        beats.add(tick);
        return (): void => {
          beats.delete(tick);
        };
      },
      onQueued: () => undefined,
      onNotice: () => undefined,
    }).then((lease) => {
      admitted.push(pid);
      leases.set(pid, lease);
    }),
  );
  const startMs = clockMs;
  const until = async (count: number): Promise<number> => {
    for (let i = 0; i < MACROTASKS_PER_CHECK && admitted.length < count; i += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    return clockMs - startMs;
  };

  const firstAt = await until(1);
  expect(admitted, "past the ceiling only the first waiter starts; the second stays queued").toStrictEqual([41_002]);
  expect(leases.get(41_002)?.slot, "it runs as the overflow run, beside the stuck battery").toBeNull();
  const secondAt = await until(2);
  expect(admitted, "the second waiter starts at the hard ceiling while both runs are still live").toStrictEqual([41_002, 41_003]);
  expect(secondAt, "the hard ceiling is twice the first").toBeGreaterThanOrEqual(2 * firstAt - CLOCK_STEP_MS * 4);
  leases.get(41_002)?.release();
  await Promise.all(pending);
  leases.get(41_003)?.release();
  stuck?.release();
  rmSync(env[HOST_POOL_ROOT_ENV], { recursive: true, force: true });
});
