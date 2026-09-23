// T16's REAL-SUBJECT half: the pure arms live in the
// `.test.ts` twin beside this file; this one spawns an actual child that HANGS FOREVER, because the claim
// under test is that the ceiling FIRES — and only a real process can fail to return. It rides the real
// `spawnNiced` door (the nice -19 floor), which is also the door whose default ceiling is now
// `budget(120_000)`, so the arm exercises the seam every instrument spawns through.
import process from "node:process";
import { budget } from "@orb/tooling/_shared/load-budget";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { expect, test } from "../../support/tool-fixtures.ts";

/** Per-core 4.0 on a 24-core box — the same FORCED-LOAD reading the unit twin uses. */
const readLoaded = (): { loadavg1: number; cpuCount: number } => ({ loadavg1: 96, cpuCount: 24 });

test("T16 — a genuinely hung child dies at its load-scaled ceiling rather than hanging the run", async () => {
  // The subject hangs forever; only the ceiling can end it. The base is deliberately tiny so the SCALED
  // budget (base × 4) is still short — the arm proves the ceiling fires, not that the box is fast.
  const base = 250;
  const scaled = budget(base, readLoaded);
  expect(scaled).toBe(1000);
  const run = await spawnNiced(process.execPath, ["-e", "setInterval(() => undefined, 1000);"], { timeoutMs: scaled });
  expect(run.timedOut).toBe(true);
  expect(run.code).toBeNull(); // signal-killed — ALWAYS tool-error class, never a verdict

  // The ceiling is not a way to hang: the child was still running when the budget fired, and the run came
  // back in a bounded time with a signal kill rather than a status. (The MESSAGE half is pinned in the
  // unit twin, which needs no child.)
});
