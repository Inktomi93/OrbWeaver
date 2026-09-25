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
// unheld when `kill(pid, 0)` says its pid is gone, or — on Linux, the one platform with `/proc` — when the
// `/proc/<pid>/stat` start ticks of the process behind that pid differ from the ticks the holder recorded
// for itself (the pid was reused). Start ticks count from boot, so no wall-clock step can make a live
// holder read as reused. Never compare them with a wall-clock time: `/proc/stat` btime moves with every
// clock step, so a live holder would read as reused and two runs would share a one-slot pool. With no
// ticks on either side (macOS, Windows, or a record without them), `kill(pid, 0)` alone decides, which
// works on every platform Node runs on. `kill(pid, 0)` cannot tell EPERM (a live foreign pid) from ESRCH
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
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "./entrypoint.ts";
import { budget } from "./load-budget.ts";
import { procStartTicks } from "./proc-stat.ts";
import { processEnvValue } from "./process-env.ts";

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

/** Who holds a slot, as its file records it. */
export interface HostSlotHolder {
  readonly pid: number;
  readonly startedAt: string;
  readonly label: string;
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

function slotPath(dir: string, slot: number): string {
  return join(dir, `${String(slot)}.lock`);
}

const GROUP_OR_OTHER_WRITE = 0o022;
const OWNER_ONLY_DIR = 0o700;

// POSIX ownership and mode are the check where the platform has them; Windows has neither, and its temp
// dir is already per-user.
function refuseForeignDir(dir: string): void {
  const stat = lstatSync(dir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`host pool directory ${dir} is a symlink or not a directory — refusing to write through it.`);
  }
  const uid = process.getuid?.();
  // biome-ignore lint/suspicious/noBitwiseOperators: a POSIX file mode is an OS-owned bitfield; masking it is the only way to read the group and other write bits.
  if (uid !== undefined && (stat.uid !== uid || (stat.mode & GROUP_OR_OTHER_WRITE) !== 0)) {
    throw new Error(`host pool directory ${dir} must be owned by uid ${String(uid)} and not writable by group or others — refusing to use it.`);
  }
}

/** Create (owner-only) or accept one pool directory, and refuse one that is not ours. */
function ownedDir(dir: string): string {
  mkdirSync(dir, { recursive: true, mode: OWNER_ONLY_DIR });
  refuseForeignDir(dir);
  return dir;
}

/** A pool entry is absent or a regular file; anything else is a planted entry and is refused. */
function refusePlantedEntry(path: string): void {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat !== undefined && !stat.isFile()) {
    throw new Error(`host pool entry ${path} is a symlink or not a regular file — refusing to read or replace it.`);
  }
}

/** A slot file or a queue ticket. Only a ticket carries `beatMs`, its last heartbeat. `startTicks` is the
 *  writer's own `/proc` start ticks, or `null` where it had none to read. */
interface PoolRecord extends HostSlotHolder {
  readonly beatMs: number | null;
  readonly startTicks: string | null;
}

function readHolder(path: string): PoolRecord | null {
  refusePlantedEntry(path);
  // @orb-waive caught-failure-ownership(catch): the FAILURE IS THE VERDICT — an unreadable or half-written slot file is DEBRIS, and `null` is how this reader says so to its one caller, which then STEALS the slot and PRINTS that it did. Any other surfacing wedges the box on a torn write. Ends if a caller starts reading `null` as "someone holds this".
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const row = parsed as Record<string, unknown>;
    const pid = row["pid"];
    if (typeof pid !== "number") {
      return null;
    }
    return {
      pid,
      startedAt: typeof row["startedAt"] === "string" ? row["startedAt"] : "unknown",
      label: typeof row["label"] === "string" ? row["label"] : "",
      beatMs: typeof row["beatMs"] === "number" ? row["beatMs"] : null,
      startTicks: typeof row["startTicks"] === "string" ? row["startTicks"] : null,
    };
  } catch {
    return null;
  }
}

/** The process table as this module reads it. Injected as ONE unit: a test that fakes `alive` gets no real
 *  `/proc` start ticks for its fake pids unless it fakes those too. */
interface Liveness {
  readonly alive: (pid: number) => boolean;
  readonly startTicks: (pid: number) => string | null;
}

const HOLDER_STATES = ["live", "gone", "reused"] as const;
type HolderState = (typeof HOLDER_STATES)[number];

// `alive` runs first: a pid that is gone, or foreign (EPERM), never reaches the `/proc` read, so the read
// only ever sees our own processes. A pid that exits between the two reads `null` and is gone next poll.
function holderState(liveness: Liveness, holder: PoolRecord): HolderState {
  if (!liveness.alive(holder.pid)) {
    return "gone";
  }
  if (holder.startTicks === null) {
    return "live";
  }
  const current = liveness.startTicks(holder.pid);
  return current === null || current === holder.startTicks ? "live" : "reused";
}

const STATE_TEXT: Readonly<Record<Exclude<HolderState, "live">, string>> = { gone: "no such process", reused: "reused by a newer process" };

function defaultAlive(pid: number): boolean {
  // @orb-waive caught-failure-ownership(catch): `kill(pid, 0)` ASKS A QUESTION and throws to answer "no" — the throw IS the ESRCH answer, not a lost failure, and the caller acts on the boolean by stealing the slot and saying so out loud. Ends if this ever needs to distinguish EPERM from ESRCH.
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Start ticks exist only where `/proc` does; everywhere else no ticks are recorded and `kill(pid, 0)` alone
 *  decides (header). */
function platformStartTicks(pid: number): string | null {
  return process.platform === "linux" ? procStartTicks(pid) : null;
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
  /** The `/proc` start ticks of the process behind `pid`, or `null`. Defaults to the platform's reader only
   *  when `alive` is not injected, so a faked process table never meets a real one. */
  readonly startTicks?: (pid: number) => string | null;
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
        return lease(waiter.slotPaths[swept] ?? "", swept + 1, waiter.pid, 0);
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
  readonly startTicks: string | null;
  readonly body: string;
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
  const liveness: Liveness =
    deps.alive === undefined
      ? { alive: defaultAlive, startTicks: deps.startTicks ?? platformStartTicks }
      : { alive: deps.alive, startTicks: deps.startTicks ?? ((): null => null) };
  const startTicks = liveness.startTicks(pid);
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
    startTicks,
    body: `${JSON.stringify({ pid, startedAt, label: pool.label, startTicks }, null, 2)}\n`,
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
    return lease(waiter.slotPaths[swept] ?? "", swept + 1, waiter.pid, waiter.now().getTime() - waiter.startedMs);
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
      return lease(path, null, waiter.pid, waiter.now().getTime() - waiter.startedMs);
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
  const ticket: PoolRecord = { pid: waiter.pid, startedAt: waiter.startedAt, label: waiter.pool.label, beatMs, startTicks: waiter.startTicks };
  const tmp = `${waiter.ticket}.${String(waiter.pid)}.tmp`;
  rmSync(tmp, { force: true });
  writeFileSync(tmp, `${JSON.stringify(ticket)}\n`, { flag: "wx" });
  renameSync(tmp, waiter.ticket);
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

interface SweepInput {
  readonly paths: readonly string[];
  readonly body: string;
  readonly liveness: Liveness;
}

/** ONE sweep across `paths`. Three outcomes: the INDEX taken · `"stole"` (nothing taken, but at least one
 *  dead holder's file was cleared, so the caller must sweep again AT ONCE) · `null` (every file is held by
 *  a LIVE holder).
 *
 *  A stolen file is re-attempted on the NEXT sweep rather than written straight away, because another
 *  waiter may have won the same steal — a second `wx` is how we find that out without a second race. */
function takeAnySlot(input: SweepInput, onNotice: ((message: string) => void) | undefined): number | "stole" | null {
  let stole = false;
  for (const [index, path] of input.paths.entries()) {
    // `wx` is the whole mechanism: an EXCLUSIVE create is atomic, so two runners racing this line cannot
    // both win. A pre-read-then-write would have a window exactly the size of the defect.
    // @orb-waive caught-failure-ownership(catch): the EEXIST throw IS "this slot is taken" — the catch arm reads the holder and either moves to the next slot (live) or STEALS the slot with a printed note (dead). Every path out of it is owned and visible. Ends if this stops re-deciding and starts swallowing.
    try {
      writeFileSync(path, input.body, { flag: "wx" });
      return index;
    } catch {
      const holder = readHolder(path);
      // A LIVE holder is a holder, even if its pid is OURS. Exempting our own pid so a recycled pid could
      // be stolen made the cap silently double-issue: one process holding both CT slots was handed slot 1
      // a third time, because it read its own record as debris. `holderState` catches a recycled pid by its
      // `/proc` start ticks instead.
      const state = holder === null ? "gone" : holderState(input.liveness, holder);
      if (holder !== null && state === "live") {
        continue;
      }
      const who = holder === null || state === "live" ? "an unreadable record" : `pid ${String(holder.pid)} (${STATE_TEXT[state]})`;
      onNotice?.(`host slot file ${path} was held by ${who} — stealing it; a dead holder must never wedge the box.`);
      rmSync(path, { force: true });
      stole = true;
    }
  }
  return stole ? "stole" : null;
}

/** Every slot's live holder, in slot order — the list a caller's "queued behind" sentence is built from. */
function liveHolders(paths: readonly string[], liveness: Liveness): readonly HostSlotHolder[] {
  const holders: HostSlotHolder[] = [];
  for (const path of paths) {
    const holder = readHolder(path);
    if (holder !== null && holderState(liveness, holder) === "live") {
      holders.push(holder);
    }
  }
  return holders;
}

function lease(path: string, slot: number | null, pid: number, waitedMs: number): HostSlotLease {
  let released = false;
  return {
    slot,
    waitedMs,
    release: (): void => {
      if (released) {
        return;
      }
      released = true;
      const current = readHolder(path);
      if (existsSync(path) && (current === null || current.pid === pid)) {
        rmSync(path, { force: true });
      }
    },
  };
}
