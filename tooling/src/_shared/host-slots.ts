// HOST-WIDE SLOT POOLS (#1835) — the one mechanism behind "at most N of these may run ON THIS BOX at once".
//
// WHY IT IS HOST-WIDE AND NOT PER-WORKTREE. Every cap the fleet had was written per checkout: one CT runner
// lock per worktree, one verify run per checkout, one biome pool under `<root>/node_modules/.cache/`. Six
// lanes across two accounts therefore multiplied every cap by six, which is how a 24-core box reached
// node_load1 105.8 with the co-hosted homelab starved. A pool under `$XDG_RUNTIME_DIR` (`/run/user/<uid>`)
// is per-USER, so every worktree and both accounts contend for the SAME N slots — the cap finally caps.
//
// IT QUEUES; IT NEVER REFUSES. A refused run is an exit-2 tool error in a lane, which breaks a merge train
// and costs a re-dispatch — the expensive failure. Waiting costs wall clock and nothing else. So a caller
// that finds every slot held WAITS, announcing who it is behind, in ARRIVAL ORDER: each waiter keeps a
// ticket in `queue/`, and only the oldest live ticket may take a slot. The one exception is
// `tryAcquireHostSlot`, for an ADVISORY caller (the edit hook) whose honest answer to a full pool is
// "skipped": it takes a free slot now or reports that none is free, and it never jumps a live waiter.
//
// PAST THE CEILING, ONE AT A TIME. When the head of the queue has waited past its (load-scaled) ceiling,
// it takes `overflow.lock` and runs, with a loud notice naming the holder it went around. Every later
// waiter stays queued behind it. Letting every waiter past its ceiling start at once turned a stuck holder
// into a load spike that stalled every run on the box. If the holder AND the overflow run are both still
// live at twice the ceiling, the head takes the one further file, `overflow-2.lock`. That bounds the wait
// behind a live but stuck run at one extra run per ceiling, and never more than two past the cap.
//
// STALE SLOTS SELF-HEAL, same shape as ct-runner-lock.ts: a killed holder leaves its file behind, and a
// slot nobody holds must never wedge the box, so an unheld slot is STOLEN with a printed note. A holder is
// unheld when `kill(pid, 0)` says its pid is gone, or when its slot file's HEARTBEAT has stopped: a lease
// rewrites its file with a fresh `beatMs` on a timer, so a live holder always reads fresh, and a pid the OS
// handed to something else never refreshes a file it does not know. The same beat the queue tickets carry,
// on every platform Node runs on. `kill(pid, 0)` cannot tell EPERM (a live foreign pid) from ESRCH
// (gone), so a foreign pid reads as GONE and its slot is taken — the safe direction, since these pools
// only ever contend with our own fleet.
//
// THE DIRECTORY IS OURS OR IT IS REFUSED. With no runtime dir the root is the OS temp dir, which other
// users can write. A pool or queue directory that is a symlink, belongs to another user, or is writable by
// group or others, and a pool entry that is a symlink or not a regular file, is a REFUSAL (a thrown error):
// a planted entry could otherwise turn one of our writes into a write through someone else's link.
//
// THE VOCABULARY IS THE CALLER'S. This module decides WHEN a caller is queued, has acquired, or has given
// up waiting; the SENTENCES belong to the caller (`verify: queued behind pid …` reads nothing like
// `ct: waiting for a host CT slot`). One mechanism, several dialects.
import { existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import process from "node:process";
import { readConcurrencyProfile, readStageBudgets } from "./concurrency-profile.ts";
import { refuseDirectInvocation } from "./entrypoint.ts";
import type { HostSlotHolder, Liveness } from "./host-slot-records.ts";
import { defaultAlive, holderState, liveHolders, ownedDir, readHolder, rewriteRecord, STATE_TEXT, takeAnySlot } from "./host-slot-records.ts";
import { budget } from "./load-budget.ts";
import { processEnvValue } from "./process-env.ts";

export type { HostSlotHolder } from "./host-slot-records.ts";

refuseDirectInvocation(import.meta.url, "pnpm check (or pnpm test:ct <paths…>)");

/** One pool's identity: its directory suffix and printed name (`<runtime>/orb-<name>-slots/`), the label its
 *  slot file records so an operator sees WHAT holds a slot, and its size — from
 *  tooling/concurrency-profile.json, never a literal. */
export interface HostSlotPoolIdentity {
  readonly name: string;
  readonly label: string;
  readonly slots: number;
}

/** A queueing pool. `waitBaseMs` is the QUIET-BOX base for how long the head of the queue waits before it
 *  takes the first overflow run; load-scaled through `load-budget.ts` at acquire time, because a contended
 *  box has a legitimately longer queue and a ceiling written for a quiet one would admit the overflow run
 *  exactly when it matters most. */
export interface HostSlotPool extends HostSlotPoolIdentity {
  readonly waitBaseMs: number;
}

/** A queueing caller ALWAYS gets one of these — the pool queues, it never refuses (header). `slot` is `null`
 *  for an overflow run admitted past a wait ceiling; `release()` is idempotent and is called from a
 *  `finally`. */
export interface HostSlotLease {
  readonly slot: number | null;
  readonly waitedMs: number;
  readonly release: () => void;
}

/** The env var naming the per-USER runtime directory. ONE spelling, so every pool demonstrably shares a
 *  root. */
export const HOST_POOL_ROOT_ENV = "XDG_RUNTIME_DIR";

/** The host-wide pool root: per-USER, so every worktree and both accounts share it. The OS temp dir is the
 *  fallback for a shell with no runtime dir (a cron/ssh context, macOS, Windows) and is host-wide too. */
export function hostPoolRoot(env?: NodeJS.ProcessEnv): string {
  // The ambient read goes through `process-env.ts`'s `processEnvValue` — the fleet's ONE door for an
  // ambient tooling value — rather than growing another `process.env` policy site here.
  const runtime = env === undefined ? processEnvValue(HOST_POOL_ROOT_ENV) : env[HOST_POOL_ROOT_ENV];
  return runtime === undefined || runtime.trim() === "" ? tmpdir() : runtime;
}

/** This pool's directory. Named `orb-<name>-slots` so an operator listing `/run/user/<uid>` can see at a
 *  glance which fleet pools are live. */
export function hostPoolDir(pool: HostSlotPoolIdentity, env?: NodeJS.ProcessEnv): string {
  return join(hostPoolRoot(env), `orb-${pool.name}-slots`);
}

/** The CT pool's name: its directory is `<runtime>/orb-ct-slots/`. */
export const CT_HOST_POOL_NAME = "ct";

/** THE CT POOL, one identity for every live Chromium fleet a checkout holds for minutes: a `pnpm test:ct`
 *  run and a snap session daemon. Its size and queue ceiling come from the concurrency profile, so the
 *  wait a run may spend and the verify stage ceiling that covers it read one number. */
export function ctHostSlotPool(label: string, env?: NodeJS.ProcessEnv): HostSlotPool {
  return { name: CT_HOST_POOL_NAME, label, slots: readConcurrencyProfile(env).ctRunnersHostWide, waitBaseMs: readStageBudgets(env).ctHostWaitMs };
}

/** Is `pid` waiting in this pool's queue right now? A caller watching a child boot reads it so time the
 *  child spends queued is not charged to the child's own boot budget. Only a ticket whose beat is fresh by
 *  the queue's own rule counts: a hung waiter stops beating, and must not pause its caller's clock forever. */
export function hostSlotQueued(pool: HostSlotPoolIdentity, pid: number, env?: NodeJS.ProcessEnv, nowMs: number = Date.now()): boolean {
  const queueDir = join(hostPoolDir(pool, env), QUEUE_DIR);
  const suffix = `-${String(pid).padStart(TICKET_PID_DIGITS, "0")}${TICKET_SUFFIX}`;
  if (!existsSync(queueDir)) {
    return false;
  }
  return readdirSync(queueDir)
    .filter((name) => name.endsWith(suffix))
    .some((name) => {
      const ticket = readHolder(join(queueDir, name));
      return ticket !== null && ticket.pid === pid && ticket.beatMs !== null && nowMs - ticket.beatMs <= TICKET_STALE_MS;
    });
}

function slotPath(dir: string, slot: number): string {
  return join(dir, `${String(slot)}.lock`);
}

/** The poll timer is deliberately NOT `unref()`d. An unref'd timer does not hold the event loop open, so a
 *  process whose ONLY pending work is this wait EXITS — measured 2026-09-06 driving the real verify door:
 *  node printed "Detected unsettled top-level await" and the queued run ended with exit 0 having run
 *  NOTHING. A verify that reports clean without running is the lying-tool shape this repo fixes on sight,
 *  so waiting keeps the process alive, exactly like the work it is waiting to do. */
function defaultSleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** How often a blocked caller re-checks. Long enough to cost nothing (a whole verify run is minutes), short
 *  enough that a freed slot is picked up promptly. */
const POLL_MS = 2000;
const MS_PER_SECOND = 1000;
/** A waiter rewrites its ticket on every poll, so a ticket this old belongs to a killed or frozen waiter
 *  (or a recycled pid) and is pruned. A pruned live waiter rewrites the same name and keeps its place. */
const TICKET_STALE_MS = 30_000;
/** A holder rewrites its slot file this often, on a timer that never holds the process open. */
const HOLDER_BEAT_MS = 5000;
/** A slot file silent for this long belongs to a frozen holder or a recycled pid. Generous, because a
 *  holder blocked in a synchronous child spawn beats late, and a truly dead holder is already gone by pid. */
const HOLDER_STALE_MS = 600_000;
const QUEUE_DIR = "queue";
const TICKET_SUFFIX = ".json";
/** The overflow files, in the order the head takes them: the first at the ceiling, the second at the hard
 *  ceiling (twice the ceiling) when the holder and the first overflow run are both still live. */
const OVERFLOW_FILES = ["overflow.lock", "overflow-2.lock"] as const;
// Zero-padded so a plain lexicographic sort of the ticket names IS arrival order (the pid breaks a tie).
const TICKET_MS_DIGITS = 16;
const TICKET_PID_DIGITS = 10;

export interface HostSlotDeps {
  readonly now?: () => Date;
  readonly pid?: number;
  readonly alive?: (pid: number) => boolean;
  /** Registers the holder's heartbeat timer; `setInterval` unref'd in production, a no-op in a test. */
  readonly beat?: (tick: () => void, everyMs: number) => (() => void) | undefined;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly env?: NodeJS.ProcessEnv;
  /** Called ONCE, the first time this caller has to wait, with the holder it is queued behind. The caller
   *  owns the sentence — see the module header. */
  readonly onQueued?: (holder: HostSlotHolder) => void;
  /** Called when a dead holder's slot or a dead waiter's ticket was cleared, and when the head of the queue
   *  passes a ceiling. Each is a self-healing event that must never be silent. */
  readonly onNotice?: (message: string) => void;
}

/** THE DOOR. Take one of `pool.slots` host-wide slots, waiting in arrival order if they are all live.
 *
 *  The returned lease ALWAYS lets the caller proceed — `slot` is `null` for an overflow run the pool admits
 *  once the head of the queue has waited past a ceiling. `release()` is idempotent and only
 *  removes a file that still names us: a slot a later run legitimately re-created is not ours to delete. */
export async function acquireHostSlot(pool: HostSlotPool, deps: HostSlotDeps = {}): Promise<HostSlotLease> {
  const sleep = deps.sleep ?? defaultSleep;
  // The ceiling is LOAD-SCALED through the one policy: on a contended box the queue is legitimately
  // longer, and a ceiling written for a quiet box would admit the overflow run exactly when it matters most.
  const waiter = openWaiter(pool, budget(pool.waitBaseMs), deps);
  let announced = false;
  let steals = 0;
  try {
    for (;;) {
      const nowMs = waiter.now().getTime();
      writeTicket(waiter, nowMs);
      const admitted = isHead(waiter, nowMs) ? admitHead(waiter, nowMs) : null;
      if (admitted !== null && admitted !== "stole") {
        return admitted;
      }
      // A STEAL RE-SWEEPS IMMEDIATELY, and that is not an optimisation. Stealing only CLEARS the dead
      // holder's file; the slot is taken on the next `wx`. Falling through to the wait path here made a
      // caller that had just freed a slot decide it was still full. Bounded by `pool.slots` so a
      // pathological re-creator cannot spin us forever.
      if (admitted === "stole" && steals < pool.slots) {
        steals += 1;
        continue;
      }
      const first = liveHolders(waiter.slotPaths, waiter.liveness)[0];
      if (!announced && first !== undefined) {
        announced = true;
        deps.onQueued?.(first);
      }
      await sleep(POLL_MS);
    }
  } finally {
    rmSync(waiter.ticket, { force: true });
  }
}

/** THE ADVISORY DOOR. Take a free slot NOW, or `null` when every slot is held by a live holder or a live
 *  waiter is queued ahead. It never waits, never overflows, and never jumps the queue: a caller that can
 *  honestly answer "skipped" must not starve one that is waiting. Dead holders are stolen as in the
 *  queueing door, out loud. Synchronous, so two calls in one process never interleave. */
export function tryAcquireHostSlot(pool: HostSlotPoolIdentity, deps: HostSlotDeps = {}): HostSlotLease | null {
  const waiter = openWaiter(pool, Number.POSITIVE_INFINITY, deps);
  try {
    const nowMs = waiter.now().getTime();
    writeTicket(waiter, nowMs);
    if (!isHead(waiter, nowMs)) {
      return null;
    }
    // One sweep per slot at most: each steal clears one dead holder, and the next sweep may take it.
    for (let sweep = 0; sweep <= pool.slots; sweep += 1) {
      const swept = takeAnySlot({ paths: waiter.slotPaths, body: waiter.body, liveness: waiter.liveness }, waiter.onNotice);
      if (typeof swept === "number") {
        return lease(waiter, waiter.slotPaths[swept] ?? "", swept + 1, 0);
      }
      if (swept === null) {
        return null;
      }
    }
    return null;
  } finally {
    rmSync(waiter.ticket, { force: true });
  }
}

/** One waiter's fixed facts, plus the highest ceiling it has already announced, so each notice prints once. */
interface Waiter {
  readonly pool: HostSlotPoolIdentity;
  readonly dir: string;
  readonly queueDir: string;
  readonly ticket: string;
  readonly pid: number;
  readonly liveness: Liveness;
  readonly now: () => Date;
  readonly startedMs: number;
  readonly startedAt: string;
  readonly body: string;
  readonly beat: (tick: () => void, everyMs: number) => (() => void) | undefined;
  readonly ceilingMs: number;
  readonly slotPaths: readonly string[];
  readonly overflowPaths: readonly string[];
  readonly onNotice: ((message: string) => void) | undefined;
  noticedLevel: number;
}

function openWaiter(pool: HostSlotPoolIdentity, ceilingMs: number, deps: HostSlotDeps): Waiter {
  const now = deps.now ?? ((): Date => new Date());
  const pid = deps.pid ?? process.pid;
  const dir = ownedDir(hostPoolDir(pool, deps.env));
  const queueDir = ownedDir(join(dir, QUEUE_DIR));
  const startedMs = now().getTime();
  const startedAt = new Date(startedMs).toISOString();
  const liveness: Liveness = { alive: deps.alive ?? defaultAlive, nowMs: (): number => now().getTime(), staleAfterMs: HOLDER_STALE_MS };
  return {
    pool,
    dir,
    queueDir,
    ticket: join(queueDir, `${String(startedMs).padStart(TICKET_MS_DIGITS, "0")}-${String(pid).padStart(TICKET_PID_DIGITS, "0")}${TICKET_SUFFIX}`),
    pid,
    liveness,
    now,
    startedMs,
    startedAt,
    body: `${JSON.stringify({ pid, startedAt, label: pool.label, beatMs: startedMs }, null, 2)}\n`,
    beat: deps.beat ?? defaultBeat,
    ceilingMs,
    slotPaths: Array.from({ length: pool.slots }, (_, i) => slotPath(dir, i + 1)),
    overflowPaths: OVERFLOW_FILES.map((file) => join(dir, file)),
    onNotice: deps.onNotice,
    noticedLevel: 0,
  };
}

/** The head of the queue asks for a slot, and past each ceiling for one more overflow file. `"stole"` means
 *  a dead holder's slot was just cleared and the caller must ask again at once; `null` means keep waiting. */
function admitHead(waiter: Waiter, nowMs: number): HostSlotLease | "stole" | null {
  const swept = takeAnySlot({ paths: waiter.slotPaths, body: waiter.body, liveness: waiter.liveness }, waiter.onNotice);
  if (typeof swept === "number") {
    return lease(waiter, waiter.slotPaths[swept] ?? "", swept + 1, waiter.now().getTime() - waiter.startedMs);
  }
  const level = Math.min(waiter.overflowPaths.length, Math.floor((nowMs - waiter.startedMs) / waiter.ceilingMs));
  if (swept === "stole" || level < 1) {
    return swept;
  }
  const overflowPaths = waiter.overflowPaths.slice(0, level);
  const holders = liveHolders(waiter.slotPaths, waiter.liveness);
  // One file at a time, in order: a sweep across both would steal a dead first overflow run and then take
  // the SECOND file in the same pass, announcing a hard-ceiling run while the first overflow slot sat free.
  for (const [index, path] of overflowPaths.entries()) {
    const one = { paths: [path], body: waiter.body, liveness: waiter.liveness };
    let taken = takeAnySlot(one, waiter.onNotice);
    // A stolen overflow file is free now: take it in this poll instead of announcing a run that is gone.
    if (taken === "stole") {
      taken = takeAnySlot(one, waiter.onNotice);
    }
    if (typeof taken === "number") {
      waiter.onNotice?.(overflowNotice(waiter, holders, index));
      return lease(waiter, path, null, waiter.now().getTime() - waiter.startedMs);
    }
  }
  if (waiter.noticedLevel < level) {
    waiter.noticedLevel = level;
    const runs = liveHolders(overflowPaths, waiter.liveness).map(holderText).join("; ");
    const next = level < waiter.overflowPaths.length ? "one more run starts at twice the ceiling" : "no further run starts until one of them ends";
    waiter.onNotice?.(
      `host pool "${waiter.pool.name}" is past its ${seconds(waiter.ceilingMs * level)}s ceiling and its overflow run (${runs || "a run that has just left"}) is still live — this run stays first in the queue; ${next}.`,
    );
  }
  return null;
}

function seconds(ms: number): string {
  return String(Math.round(ms / MS_PER_SECOND));
}

function holderText(holder: HostSlotHolder | null): string {
  return holder === null ? "an unreadable record" : `pid ${String(holder.pid)}, ${holder.label}, since ${holder.startedAt}`;
}

function overflowNotice(waiter: Waiter, holders: readonly HostSlotHolder[], index: number): string {
  const held = holders.length === 0 ? "a holder that has just left" : holders.map(holderText).join("; ");
  return [
    index === 0
      ? `host pool "${waiter.pool.name}" still full after ${seconds(waiter.ceilingMs)}s, held by ${held}.`
      : `host pool "${waiter.pool.name}" past its hard ceiling of ${seconds(waiter.ceilingMs * (index + 1))}s: the holder (${held}) and the first overflow run are both still live.`,
    index === 0
      ? "Starting this run as the first overflow run; every later waiter stays queued behind it in arrival order."
      : "Starting this run as the last overflow run; no further run starts until one of these ends.",
    `If the holder is stuck, its label names the checkout it runs in; stop that pid from there. Pool files: ${waiter.dir}`,
  ].join(" ");
}

/** Rewrite this waiter's ticket through a rename, so a reader never sees a torn record and prunes it. The
 *  temp file is created exclusively: a leftover one is removed first, never written through. */
function writeTicket(waiter: Waiter, beatMs: number): void {
  rewriteRecord(waiter.ticket, { pid: waiter.pid, startedAt: waiter.startedAt, label: waiter.pool.label, beatMs }, waiter.pid);
}

/** The production heartbeat: unref'd, so a holder whose only pending work is its lease still exits. */
function defaultBeat(tick: () => void, everyMs: number): () => void {
  const timer = setInterval(tick, everyMs);
  timer.unref();
  return (): void => {
    clearInterval(timer);
  };
}

/** Is this waiter's ticket the oldest live one? A dead, silent or unreadable ticket ahead of it is pruned
 *  out loud: a killed waiter must never hold the queue. */
function isHead(waiter: Waiter, nowMs: number): boolean {
  const mine = basename(waiter.ticket);
  const names = readdirSync(waiter.queueDir)
    .filter((name) => name.endsWith(TICKET_SUFFIX))
    .toSorted();
  for (const name of names) {
    if (name === mine) {
      return true;
    }
    const path = join(waiter.queueDir, name);
    const ticket = readHolder(path);
    const state = ticket === null ? "gone" : holderState(waiter.liveness, ticket);
    if (ticket !== null && state === "live" && ticket.beatMs !== null && nowMs - ticket.beatMs <= TICKET_STALE_MS) {
      return false;
    }
    const why = ticket === null ? "an unreadable ticket" : `pid ${String(ticket.pid)} (${state === "live" ? "no heartbeat" : STATE_TEXT[state]})`;
    waiter.onNotice?.(`host queue ${waiter.queueDir}: removed ${why} ahead of this run — a dead waiter must never hold the queue.`);
    rmSync(path, { force: true });
  }
  // A peer pruned our own ticket as silent; it is rewritten on the next poll under the same name.
  return false;
}

/** The lease beats: while it is held, the slot file is rewritten with a fresh `beatMs`, only while the
 *  file still names this holder, so a slot a later run legitimately re-created is never overwritten. */
function lease(waiter: Waiter, path: string, slot: number | null, waitedMs: number): HostSlotLease {
  let released = false;
  const { pid } = waiter;
  const stillMine = (): boolean => {
    const current = readHolder(path);
    return existsSync(path) && (current === null || current.pid === pid);
  };
  const stopBeat = waiter.beat(() => {
    if (!released && stillMine()) {
      rewriteRecord(path, { pid, startedAt: waiter.startedAt, label: waiter.pool.label, beatMs: waiter.now().getTime() }, pid);
    }
  }, HOLDER_BEAT_MS);
  return {
    slot,
    waitedMs,
    release: (): void => {
      if (released) {
        return;
      }
      released = true;
      stopBeat?.();
      if (stillMine()) {
        rmSync(path, { force: true });
      }
    },
  };
}
