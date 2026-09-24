// THE HOST-WIDE SLOT POOL (tooling/src/verify/lib/host-slots.ts, #1835) — the mechanism behind "at most N
// of these may run ON THIS BOX at once", shared by the whole-run verify queue and the CT runner cap.
//
// WHAT IS PINNED HERE, and why each arm exists as a defect the pool could otherwise reintroduce:
//   · the pool is HOST-WIDE — its directory is derived from $XDG_RUNTIME_DIR (per-USER), never from a
//     checkout root. The whole #1835 finding was that every cap was per-worktree and therefore multiplied
//     by the lane count; a pool keyed off the tree would be that defect wearing new clothes.
//   · it QUEUES and NEVER REFUSES — a blocked caller announces its holder and waits in arrival order, and
//     past the ceiling the head of the queue runs as the single overflow run, with a notice. A refused run
//     is an exit-2 tool error that breaks a merge train; a stampede of every waiter at once stalls the box.
//   · a DEAD holder's slot and a DEAD waiter's ticket are cleared, out loud. Neither may wedge the box.
// No real runner is started: the mechanism is a directory of files plus `kill(pid, 0)`, and every input
// (clock, pid, process table, sleep) is injected — the same posture ct-runner-lock.test.ts takes. One test
// drives the real `kill(pid, 0)` against a reaped child, so the default liveness probe is proven too.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import type { HostSlotHolder, HostSlotLease, HostSlotPool } from "../../../../tooling/src/verify/contract/host-slots.ts";
import { acquireHostSlot, HOST_POOL_ROOT_ENV, hostPoolDir, hostPoolRoot } from "../../../../tooling/src/verify/lib/host-slots.ts";

import { expect, test } from "../../../support/tool-fixtures.ts";

/** A disposable per-user runtime dir — the pool's real root is $XDG_RUNTIME_DIR, so this IS the seam. */
function scratchRuntime(): NodeJS.ProcessEnv {
  return { [HOST_POOL_ROOT_ENV]: mkdtempSync(join(tmpdir(), "orb-host-slots-")) };
}

function poolOf(slots: number, waitBaseMs = 1): HostSlotPool {
  return { name: "unit", label: "a unit test", slots, waitBaseMs };
}

/** Nobody is alive but the pids we name — the fake process table that makes the stale arm deterministic. */
function aliveOnly(...pids: readonly number[]): (pid: number) => boolean {
  return (pid): boolean => pids.includes(pid);
}

/** A clock that only moves when the caller SLEEPS. Deterministic, and it makes the ceiling arm exact
 *  instead of a wall-clock race. */
function fakeClock(): { now: () => Date; sleep: (ms: number) => Promise<void> } {
  let ms = 1_000_000;
  return {
    now: (): Date => new Date(ms),
    sleep: (delta): Promise<void> => {
      ms += delta;
      return Promise.resolve();
    },
  };
}

test("the pool directory is derived from $XDG_RUNTIME_DIR — per-USER, never per-checkout (#1835)", () => {
  expect(hostPoolDir(poolOf(1), { [HOST_POOL_ROOT_ENV]: "/run/user/1000" })).toBe("/run/user/1000/orb-unit-slots");
  // A shell with no runtime dir (cron/ssh) still gets a HOST-wide root, not a per-tree one.
  expect(hostPoolRoot({}), "no XDG_RUNTIME_DIR").toBe("/tmp");
  expect(hostPoolRoot({ [HOST_POOL_ROOT_ENV]: "   " }), "an empty value is not a directory").toBe("/tmp");
});

test("a free pool hands out a slot immediately, and the slot file names its holder", async () => {
  const env = scratchRuntime();
  const clock = fakeClock();
  const lease = await acquireHostSlot(poolOf(2), { env, pid: 4242, alive: aliveOnly(4242), ...clock });
  expect(lease.slot, "the first caller takes slot 1").toBe(1);
  expect(lease.waitedMs, "nothing to wait for").toBe(0);
  const record: unknown = JSON.parse(readFileSync(join(hostPoolDir(poolOf(2), env), "1.lock"), "utf8"));
  expect(record, "an operator reading /run/user/<uid> must see WHO holds a slot").toMatchObject({ pid: 4242, label: "a unit test" });
  rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
});

test("slots fill in order, and release gives the slot back", async () => {
  const env = scratchRuntime();
  const deps = { env, alive: aliveOnly(1, 2) };
  const first = await acquireHostSlot(poolOf(2), { ...deps, pid: 1 });
  const second = await acquireHostSlot(poolOf(2), { ...deps, pid: 2 });
  expect([first.slot, second.slot], "two callers, two slots").toStrictEqual([1, 2]);
  first.release();
  const third = await acquireHostSlot(poolOf(2), { ...deps, pid: 3, alive: aliveOnly(2, 3) });
  expect(third.slot, "the freed slot is reused, not a third one invented").toBe(1);
  rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
});

test("a full pool ANNOUNCES its holder, WAITS, and past the ceiling runs as the overflow run — it never refuses", async () => {
  const env = scratchRuntime();
  const clock = fakeClock();
  const held = await acquireHostSlot(poolOf(1), { env, pid: 900, alive: aliveOnly(900) });
  expect(held.slot).toBe(1);

  const queued: HostSlotHolder[] = [];
  const notices: string[] = [];
  const blocked = await acquireHostSlot(poolOf(1, 5000), {
    env,
    pid: 901,
    alive: aliveOnly(900, 901),
    now: clock.now,
    sleep: clock.sleep,
    onQueued: (holder) => queued.push(holder),
    onNotice: (message) => notices.push(message),
  });
  expect(
    queued.map((h) => h.pid),
    "the waiter names the pid it is behind, exactly once",
  ).toStrictEqual([900]);
  expect(blocked.slot, "past the ceiling the caller PROCEEDS — a refused run breaks a merge train").toBeNull();
  expect(blocked.waitedMs, "and it says how long it waited").toBeGreaterThanOrEqual(5000);
  expect(notices.join("\n"), "the overflow admission is never silent").toContain("single overflow run");
  rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
});

test("past the ceiling, waiters are admitted ONE AT A TIME in arrival order — never all at once", async () => {
  const env = scratchRuntime();
  const holder = await acquireHostSlot(poolOf(1), { env, pid: 950, alive: aliveOnly(950) });
  expect(holder.slot).toBe(1);

  // Every waiter shares one clock that moves by the poll interval, so heartbeats stay fresh while the small
  // base ceiling passes within a few polls. The sleep yields a macrotask so the waiters interleave the way
  // separate processes do.
  let clockMs = 2_000_000;
  const now = (): Date => new Date(clockMs);
  const sleep = async (ms: number): Promise<void> => {
    clockMs += ms;
    await new Promise<void>((resolve) => setImmediate(resolve));
  };
  const waiters = [951, 952, 953];
  const alive = aliveOnly(950, ...waiters);
  const admitted: number[] = [];
  const leases = new Map<number, HostSlotLease>();
  const notices: string[] = [];
  const pending = waiters.map((pid) =>
    acquireHostSlot(poolOf(1, 1000), { env, pid, alive, now, sleep, onNotice: (m) => notices.push(m) }).then((lease) => {
      admitted.push(pid);
      leases.set(pid, lease);
    }),
  );
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 50; i += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  };

  await settle();
  expect(admitted, "the stuck holder still runs, so only the head of the queue is admitted").toStrictEqual([951]);
  expect(notices.join("\n"), "the admission names the holder it went around").toContain("pid 950");
  leases.get(951)?.release();
  await settle();
  expect(admitted, "the next waiter follows only when the admitted one finishes").toStrictEqual([951, 952]);
  leases.get(952)?.release();
  await settle();
  expect(admitted, "arrival order holds to the end of the queue").toStrictEqual([951, 952, 953]);
  await Promise.all(pending);
  leases.get(953)?.release();
  holder.release();
  rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
});

test("a LIVE holder is a holder even when its pid is OURS — the cap never double-issues a slot", async () => {
  // RED-FIRST, found live (2026-09-06): the first cut exempted `holder.pid === pid` so a recycled pid
  // could be stolen, and driving the CT cap in ONE process handed slot 1 out a THIRD time while both
  // slots were held — the cap silently double-issuing, which is the whole thing it exists to prevent.
  const env = scratchRuntime();
  const clock = fakeClock();
  const mine = await acquireHostSlot(poolOf(1), { env, pid: 4321, alive: aliveOnly(4321) });
  expect(mine.slot).toBe(1);
  const again = await acquireHostSlot(poolOf(1, 5000), { env, pid: 4321, alive: aliveOnly(4321), now: clock.now, sleep: clock.sleep });
  expect(again.slot, "a second ask from the same live pid must not be handed the slot it already holds").toBeNull();
  rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
});

test("a DEAD holder's slot is stolen, out loud — a killed run must never wedge the box", async () => {
  const env = scratchRuntime();
  const dir = hostPoolDir(poolOf(1), env);
  await acquireHostSlot(poolOf(1), { env, pid: 700, alive: aliveOnly(700) });
  const notices: string[] = [];
  // pid 700 is now GONE (it is absent from the process table below) — the next caller must take the slot.
  const next = await acquireHostSlot(poolOf(1), { env, pid: 701, alive: aliveOnly(701), onNotice: (m) => notices.push(m) });
  expect(next.slot, "the dead holder's slot is reused").toBe(1);
  expect(notices.join("\n")).toContain("no such process");
  expect(JSON.parse(readFileSync(join(dir, "1.lock"), "utf8")), "the slot file now names the new holder").toMatchObject({ pid: 701 });
  rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
});

test("a killed or silent waiter's ticket never holds the queue", async () => {
  const env = scratchRuntime();
  const queue = join(hostPoolDir(poolOf(1), env), "queue");
  mkdirSync(queue, { recursive: true });
  const clock = fakeClock();
  // Two tickets older than any real one: a waiter whose process is gone, and a live pid whose waiter
  // stopped beating (a frozen waiter, or a recycled pid).
  writeFileSync(join(queue, "0000000000000001-0000000771.json"), JSON.stringify({ pid: 771, startedAt: "x", label: "killed", beatMs: 1 }));
  writeFileSync(join(queue, "0000000000000002-0000000772.json"), JSON.stringify({ pid: 772, startedAt: "x", label: "silent", beatMs: 2 }));
  const notices: string[] = [];
  const lease = await acquireHostSlot(poolOf(1), { env, pid: 773, alive: aliveOnly(772, 773), ...clock, onNotice: (m) => notices.push(m) });
  expect(lease.slot, "the free slot goes to the first live waiter").toBe(1);
  expect(notices.join("\n")).toContain("pid 771 (no such process)");
  expect(notices.join("\n")).toContain("pid 772 (no heartbeat)");
  expect(readdirSync(queue), "the admitted waiter leaves no ticket behind").toStrictEqual([]);
  lease.release();
  rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
});

test("a slot whose holder process really exited is stolen through the real kill(pid, 0)", async () => {
  const env = scratchRuntime();
  const dir = hostPoolDir(poolOf(1), env);
  mkdirSync(dir, { recursive: true });
  // A real pid that has exited and been reaped: spawnSync returns only after the child is gone.
  const exited = spawnSync(process.execPath, ["-e", ""]).pid;
  writeFileSync(join(dir, "1.lock"), JSON.stringify({ pid: exited, startedAt: "x", label: "exited" }));
  const notices: string[] = [];
  const lease = await acquireHostSlot(poolOf(1), { env, pid: process.pid, onNotice: (m) => notices.push(m) });
  expect(lease.slot, "the default liveness probe reads the exited pid as gone").toBe(1);
  expect(notices.join("\n")).toContain(`pid ${String(exited)} (no such process)`);
  lease.release();
  rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
});

test("a torn/unreadable slot file is DEBRIS, not a holder", async () => {
  const env = scratchRuntime();
  const dir = hostPoolDir(poolOf(1), env);
  await acquireHostSlot(poolOf(1), { env, pid: 800, alive: aliveOnly(800) });
  writeFileSync(join(dir, "1.lock"), '{"pid": ');
  const notices: string[] = [];
  const next = await acquireHostSlot(poolOf(1), { env, pid: 801, alive: aliveOnly(800, 801), onNotice: (m) => notices.push(m) });
  expect(next.slot, "a half-written file must never wedge the pool forever").toBe(1);
  expect(notices.join("\n")).toContain("an unreadable record");
  rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
});

test("release is idempotent and never deletes a slot a LATER run legitimately re-created", async () => {
  const env = scratchRuntime();
  const dir = hostPoolDir(poolOf(1), env);
  const mine = await acquireHostSlot(poolOf(1), { env, pid: 5001, alive: aliveOnly(5001) });
  mine.release();
  const theirs = await acquireHostSlot(poolOf(1), { env, pid: 5002, alive: aliveOnly(5002) });
  mine.release(); // a second, late release from the finished run
  expect(theirs.slot).toBe(1);
  expect(JSON.parse(readFileSync(join(dir, "1.lock"), "utf8")), "the live holder still owns the slot").toMatchObject({ pid: 5002 });
  rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
});
