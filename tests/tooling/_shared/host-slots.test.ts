// THE HOST-WIDE SLOT POOL (tooling/src/_shared/host-slots.ts, #1835) — the mechanism behind "at most N
// of these may run ON THIS BOX at once", shared by the whole-run verify queue, the CT runner cap, the
// whole-program typecheck pool and the edit hook.
//
// WHAT IS PINNED HERE, and why each arm exists as a defect the pool could otherwise reintroduce:
//   · the pool is HOST-WIDE — its directory is derived from $XDG_RUNTIME_DIR (per-USER), never from a
//     checkout root. The whole #1835 finding was that every cap was per-worktree and therefore multiplied
//     by the lane count; a pool keyed off the tree would be that defect wearing new clothes.
//   · it QUEUES and NEVER REFUSES — a blocked caller announces its holder and waits in arrival order, and
//     past each ceiling the head of the queue runs as one overflow run, with a notice. A refused run
//     is an exit-2 tool error that breaks a merge train; a stampede of every waiter at once stalls the box.
//   · a DEAD holder's slot and a DEAD waiter's ticket are cleared, out loud. Neither may wedge the box.
//   · a holder BEATS: its slot file is rewritten with a fresh `beatMs` while the lease is held, so a pid the
//     OS recycled (which never refreshes a file it does not know) is stolen, and a beating holder never is.
// No real runner is started: the mechanism is a directory of files plus `kill(pid, 0)`, and every input
// (clock, pid, process table, sleep, the beat timer) is injected — the same posture ct-runner-lock.test.ts
// takes. One test drives the real `kill(pid, 0)` against a reaped child, so the default liveness probe is
// proven too, and one drives the real beat timer.
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import type { HostSlotHolder, HostSlotLease, HostSlotPool } from "@orb/tooling/_shared/host-slots";
import { acquireHostSlot, HOST_POOL_ROOT_ENV, hostPoolDir, hostPoolRoot, tryAcquireHostSlot } from "@orb/tooling/_shared/host-slots";

import { expect, test } from "../../support/tool-fixtures.ts";

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
  // The fallback is the OS temp dir, which exists on every platform; a literal `/tmp` does not on Windows.
  expect(hostPoolRoot({}), "no XDG_RUNTIME_DIR").toBe(tmpdir());
  expect(hostPoolRoot({ [HOST_POOL_ROOT_ENV]: "   " }), "an empty value is not a directory").toBe(tmpdir());
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
  expect(notices.join("\n"), "the overflow admission is never silent").toContain("first overflow run");
  rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
});

test("past the ceilings, waiters are admitted ONE AT A TIME in arrival order — never all at once", async () => {
  const env = scratchRuntime();
  const holder = await acquireHostSlot(poolOf(1), { env, pid: 950, alive: aliveOnly(950) });
  expect(holder.slot).toBe(1);

  // Every waiter shares one clock that moves by the poll interval, and every admitted lease beats on each
  // move, so a live overflow run reads fresh however far the clock runs. The ceiling is several poll rounds
  // long, so the ceiling and the hard ceiling land in different rounds. The sleep yields a macrotask so the
  // waiters interleave the way separate processes do.
  let clockMs = 2_000_000;
  const now = (): Date => new Date(clockMs);
  const ticks = new Set<() => void>();
  const beat = (tick: () => void): (() => void) => {
    ticks.add(tick);
    return () => ticks.delete(tick);
  };
  const sleep = async (ms: number): Promise<void> => {
    clockMs += ms;
    for (const tick of ticks) {
      tick();
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  };
  const waiters = [951, 952, 953];
  const alive = aliveOnly(950, ...waiters);
  const admitted: number[] = [];
  const leases = new Map<number, HostSlotLease>();
  const notices: string[] = [];
  const pending = waiters.map((pid) =>
    acquireHostSlot(poolOf(1, 10_000), { env, pid, alive, now, sleep, beat, onNotice: (m) => notices.push(m) }).then((lease) => {
      admitted.push(pid);
      leases.set(pid, lease);
    }),
  );
  // Yield until `count` waiters are in (or a generous number of rounds pass), so each check lands on the
  // round in which the admission happened rather than several ceilings later.
  const until = async (count: number, rounds = 2000): Promise<void> => {
    for (let i = 0; i < rounds && admitted.length < count; i += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  };

  await until(1);
  expect(admitted, "at the ceiling only the head of the queue is admitted").toStrictEqual([951]);
  expect(notices.join("\n"), "the admission names the holder it went around").toContain("pid 950");
  await until(2);
  expect(admitted, "at twice the ceiling, with both runs still live, the next head is admitted").toStrictEqual([951, 952]);
  await until(3, 300);
  expect(admitted, "no third run starts while the holder and both overflow runs are live").toStrictEqual([951, 952]);
  leases.get(951)?.release();
  await until(3);
  expect(admitted, "arrival order holds to the end of the queue").toStrictEqual([951, 952, 953]);
  await Promise.all(pending);
  leases.get(952)?.release();
  leases.get(953)?.release();
  holder.release();
  rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
});

test("past the ceiling, a dead run's overflow file is taken at once, not after another poll", async () => {
  const env = scratchRuntime();
  const dir = hostPoolDir(poolOf(1), env);
  const holder = await acquireHostSlot(poolOf(1), { env, pid: 990, alive: aliveOnly(990) });
  writeFileSync(join(dir, "overflow.lock"), JSON.stringify({ pid: 991, startedAt: "x", label: "dead overflow" }));
  const notices: string[] = [];
  const lease = await acquireHostSlot(poolOf(1, 1000), { env, pid: 992, alive: aliveOnly(990, 992), ...fakeClock(), onNotice: (m) => notices.push(m) });
  expect(lease.slot, "the head runs as the overflow run").toBeNull();
  expect(notices.join("\n")).toContain("pid 991 (no such process)");
  expect(notices.join("\n"), "a steal is not a live overflow run").not.toContain("still live");
  lease.release();
  holder.release();
  rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
});

/** Plant a slot-1 record the way a holder writes one, with its last heartbeat. */
function plantHolder(env: NodeJS.ProcessEnv, record: { readonly pid: number; readonly startedAt: string; readonly beatMs: number | null }): string {
  const dir = hostPoolDir(poolOf(1), env);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "1.lock");
  writeFileSync(path, JSON.stringify({ ...record, label: "recorded holder" }));
  return path;
}

/** A waiter's sleep that ends the wait: the first time it would poll again, it has queued. */
const QUEUED = "queued";
function rejectOnWait(): Promise<void> {
  return Promise.reject(new Error(QUEUED));
}

test("a live holder whose beat is fresh is never stolen, whatever its record's start time says", async () => {
  for (const startedAt of ["1970-01-01T00:00:00.000Z", "2100-01-01T00:00:00.000Z"]) {
    const env = scratchRuntime();
    const clock = fakeClock();
    const path = plantHolder(env, { pid: 993, startedAt, beatMs: clock.now().getTime() });
    const lease = await acquireHostSlot(poolOf(1, 1000), {
      env,
      pid: 994,
      alive: aliveOnly(993, 994),
      ...clock,
      onNotice: () => undefined,
    });
    expect(lease.slot, `startedAt ${startedAt}: the waiter runs as the overflow run, never in the holder's slot`).toBeNull();
    expect(JSON.parse(readFileSync(path, "utf8")), "the holder still owns its slot").toMatchObject({ pid: 993 });
    lease.release();
    rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
  }
});

test("a holder whose beat stopped is a recycled pid or a frozen run, and its slot is stolen although its pid is alive", async () => {
  const env = scratchRuntime();
  // A beat from long before the fake clock's now: the pid answers `kill(pid, 0)`, the file does not.
  plantHolder(env, { pid: 993, startedAt: new Date(1_000_000).toISOString(), beatMs: 0 });
  const notices: string[] = [];
  const lease = await acquireHostSlot(poolOf(1, 1000), {
    env,
    pid: 994,
    alive: aliveOnly(993, 994),
    ...fakeClock(),
    onNotice: (m) => notices.push(m),
  });
  expect(lease.slot, "the silent holder's slot is taken").toBe(1);
  expect(notices.join("\n")).toContain("pid 993 (no heartbeat)");
  lease.release();
  rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
});

test("a record with no beat at all is judged by its pid alone", async () => {
  const live = scratchRuntime();
  plantHolder(live, { pid: 993, startedAt: new Date(1_000_000).toISOString(), beatMs: null });
  const queued = await acquireHostSlot(poolOf(1, 1000), {
    env: live,
    pid: 994,
    alive: aliveOnly(993, 994),
    ...fakeClock(),
    onNotice: () => undefined,
  });
  expect(queued.slot, "a live pid with no beat to judge is a holder").toBeNull();
  queued.release();
  rmSync(live[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });

  const dead = scratchRuntime();
  plantHolder(dead, { pid: 993, startedAt: new Date(1_000_000).toISOString(), beatMs: null });
  const notices: string[] = [];
  const taken = await acquireHostSlot(poolOf(1, 1000), {
    env: dead,
    pid: 994,
    alive: aliveOnly(994),
    ...fakeClock(),
    onNotice: (m) => notices.push(m),
  });
  expect(taken.slot, "a gone pid's slot is stolen").toBe(1);
  expect(notices.join("\n")).toContain("pid 993 (no such process)");
  taken.release();
  rmSync(dead[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
});

test("a holder that keeps beating is never stolen, and its beat rides the injected timer", async () => {
  // A real live holder, recorded through the real door on a fake clock the beat timer advances: every tick
  // rewrites the slot file at the clock's now, so a waiter on the same clock always reads it fresh.
  const child = spawn("sleep", ["30"], { stdio: "ignore" });
  const env = scratchRuntime();
  const clock = fakeClock();
  let tick: (() => void) | null = null;
  try {
    const holderPid = child.pid ?? 0;
    const held = await acquireHostSlot(poolOf(1), {
      env,
      pid: holderPid,
      now: clock.now,
      beat: (fn) => {
        tick = fn;
      },
    });
    expect(held.slot).toBe(1);
    await clock.sleep(1_000_000);
    (tick as (() => void) | null)?.();
    const record = JSON.parse(readFileSync(join(hostPoolDir(poolOf(1), env), "1.lock"), "utf8")) as { readonly beatMs: number };
    expect(record.beatMs, "the beat rewrote the slot file at the clock's now").toBe(clock.now().getTime());
    const queued: HostSlotHolder[] = [];
    const notices: string[] = [];
    const waiter = acquireHostSlot(poolOf(1, 3_600_000), {
      env,
      pid: process.pid,
      now: clock.now,
      sleep: rejectOnWait,
      onQueued: (h) => queued.push(h),
      onNotice: (m) => notices.push(m),
    });
    await expect(waiter, "the waiter must queue behind the live holder, never take its slot").rejects.toThrow(QUEUED);
    expect(
      queued.map((h) => h.pid),
      "it names the live holder it is behind",
    ).toStrictEqual([holderPid]);
    expect(notices, "nothing was stolen").toStrictEqual([]);
  } finally {
    child.kill();
    rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
  }
});

test("a live real process whose slot file stopped beating is stolen through the real clock and the real kill(pid, 0)", async () => {
  const child = spawn("sleep", ["30"], { stdio: "ignore" });
  const env = scratchRuntime();
  try {
    plantHolder(env, { pid: child.pid ?? 0, startedAt: "2100-01-01T00:00:00.000Z", beatMs: 0 });
    const notices: string[] = [];
    const lease = await acquireHostSlot(poolOf(1), { env, pid: process.pid, onNotice: (m) => notices.push(m) });
    expect(lease.slot, "a pid whose file went silent is not the recorded holder").toBe(1);
    expect(notices.join("\n")).toContain(`pid ${String(child.pid)} (no heartbeat)`);
    lease.release();
  } finally {
    child.kill();
    rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
  }
});

test("past the hard ceiling, with the holder and the overflow run both live, exactly one more run starts", async () => {
  const env = scratchRuntime();
  const dir = hostPoolDir(poolOf(1), env);
  const holder = await acquireHostSlot(poolOf(1), { env, pid: 995, alive: aliveOnly(995) });
  writeFileSync(join(dir, "overflow.lock"), JSON.stringify({ pid: 996, startedAt: "x", label: "stuck overflow" }));
  let clockMs = 3_000_000;
  const now = (): Date => new Date(clockMs);
  const sleep = async (ms: number): Promise<void> => {
    clockMs += ms;
    await new Promise<void>((resolve) => setImmediate(resolve));
  };
  const alive = aliveOnly(995, 996, 997, 998);
  const admitted: number[] = [];
  const leases = new Map<number, HostSlotLease>();
  const notices: string[] = [];
  const pending = [997, 998].map((pid) =>
    acquireHostSlot(poolOf(1, 1000), { env, pid, alive, now, sleep, onNotice: (m) => notices.push(m) }).then((lease) => {
      admitted.push(pid);
      leases.set(pid, lease);
    }),
  );
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 200; i += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  };

  await settle();
  expect(admitted, "only the head goes past the second ceiling").toStrictEqual([997]);
  expect(leases.get(997)?.slot).toBeNull();
  expect(notices.join("\n"), "the admission says it is the hard ceiling").toContain("hard ceiling");
  leases.get(997)?.release();
  await settle();
  expect(admitted, "the next waiter takes the freed place, still one at a time").toStrictEqual([997, 998]);
  await Promise.all(pending);
  leases.get(998)?.release();
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

// ── the advisory door (0176): the edit hook's answer to a full pool is "skipped", never a wait ─────────

test("tryAcquireHostSlot takes a free slot at once and releases it, leaving no ticket behind", () => {
  const env = scratchRuntime();
  const lease = tryAcquireHostSlot(poolOf(2), { env, pid: 610, alive: aliveOnly(610) });
  expect(lease?.slot).toBe(1);
  expect(lease?.waitedMs).toBe(0);
  expect(readdirSync(join(hostPoolDir(poolOf(2), env), "queue")), "an advisory caller never leaves a ticket").toEqual([]);
  lease?.release();
  expect(existsSync(join(hostPoolDir(poolOf(2), env), "1.lock"))).toBe(false);
  rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
});

test("tryAcquireHostSlot answers null at once when every slot is live, and steals a dead holder out loud", () => {
  const env = scratchRuntime();
  const held = tryAcquireHostSlot(poolOf(1), { env, pid: 620, alive: aliveOnly(620) });
  expect(held?.slot).toBe(1);
  expect(tryAcquireHostSlot(poolOf(1), { env, pid: 621, alive: aliveOnly(620, 621) }), "a live holder: skipped, not queued").toBeNull();
  const notices: string[] = [];
  const stolen = tryAcquireHostSlot(poolOf(1), { env, pid: 622, alive: aliveOnly(622), onNotice: (m) => notices.push(m) });
  expect(stolen?.slot, "a dead holder never wedges an advisory caller either").toBe(1);
  expect(notices.join("\n")).toContain("pid 620 (no such process)");
  rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
});

test("tryAcquireHostSlot never jumps a live waiter: a free slot with someone queued ahead is theirs", () => {
  const env = scratchRuntime();
  const queue = join(hostPoolDir(poolOf(1), env), "queue");
  mkdirSync(queue, { recursive: true, mode: 0o700 });
  const { now } = fakeClock();
  const beatMs = now().getTime();
  writeFileSync(join(queue, "0000000000000001-0000000630.json"), JSON.stringify({ pid: 630, startedAt: "x", label: "waiting", beatMs }));
  expect(tryAcquireHostSlot(poolOf(1), { env, pid: 631, alive: aliveOnly(630, 631), now }), "the queued waiter goes first").toBeNull();
  // …and a DEAD waiter ahead is pruned, so the advisory caller takes the slot.
  const lease = tryAcquireHostSlot(poolOf(1), { env, pid: 632, alive: aliveOnly(632), now });
  expect(lease?.slot).toBe(1);
  rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
});

// ── the directory is ours or it is refused (0176): the temp-dir fallback is writable by other users ────

test("a symlinked or group-writable pool directory is refused before anything is written through it", async () => {
  const env = scratchRuntime();
  const root = env[HOST_POOL_ROOT_ENV] ?? "";
  const target = join(root, "attacker-directory");
  mkdirSync(target);
  symlinkSync(target, hostPoolDir(poolOf(1), env));
  expect(() => tryAcquireHostSlot(poolOf(1), { env, pid: 640, alive: aliveOnly(640) })).toThrow(/is a symlink or not a directory/u);
  await expect(acquireHostSlot(poolOf(1), { env, pid: 640, alive: aliveOnly(640) })).rejects.toThrow(/is a symlink or not a directory/u);
  expect(readdirSync(target), "nothing was written through the link").toEqual([]);
  rmSync(root, { recursive: true, force: true });
});

test("an own-uid pool directory that is only too permissive (0775, left by older code) is tightened, not refused", async () => {
  const env = scratchRuntime();
  const dir = hostPoolDir(poolOf(1), env);
  mkdirSync(dir, { recursive: true });
  chmodSync(dir, 0o775);
  const lease = await acquireHostSlot(poolOf(1), { env, pid: 641, alive: aliveOnly(641) });
  expect(lease.slot, "an own-uid directory must still be usable after the mode is fixed").toBe(1);
  // biome-ignore lint/suspicious/noBitwiseOperators: a POSIX file mode is an OS-owned bitfield; masking it is the only way to read the permission bits.
  expect(statSync(dir).mode & 0o777, "the too-permissive bits must be gone").toBe(0o700);
  rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
});

test("a planted slot symlink is refused, and its target is never read as a holder or touched", () => {
  const env = scratchRuntime();
  const dir = hostPoolDir(poolOf(1), env);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const target = join(env[HOST_POOL_ROOT_ENV] ?? "", "must-not-change.txt");
  writeFileSync(target, "preserved\n");
  symlinkSync(target, join(dir, "1.lock"));
  expect(() => tryAcquireHostSlot(poolOf(1), { env, pid: 650, alive: aliveOnly(650) })).toThrow(/is a symlink or not a regular file/u);
  expect(readFileSync(target, "utf8")).toBe("preserved\n");
  rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
});
