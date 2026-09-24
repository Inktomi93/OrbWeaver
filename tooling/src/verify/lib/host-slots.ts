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
// ticket in `queue/`, and only the oldest live ticket may take a slot.
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
// unheld when `kill(pid, 0)` says its pid is gone, or when `/proc/<pid>/stat` says the process behind that
// pid started after the record was written (the pid was reused). `kill(pid, 0)` cannot tell EPERM (a live
// foreign pid) from ESRCH (gone), so a foreign pid reads as GONE and its slot is taken — the safe
// direction, since these pools only ever contend with our own fleet.
//
// THE VOCABULARY IS THE CALLER'S. This module decides WHEN a caller is queued, has acquired, or has given
// up waiting; the SENTENCES belong to the caller (`verify: queued behind pid …` reads nothing like
// `ct: waiting for a host CT slot`). One mechanism, two dialects.
//
// NOT SHARED WITH THE EDIT HOOK'S POOL, deliberately: `.claude/hooks/biome-check.sh` is bash and uses
// `flock` under the same `$XDG_RUNTIME_DIR` root. Same policy, different language; the shared thing is the
// directory convention and the profile that sizes both.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { budget } from "@orb/tooling/_shared/load-budget";
import { processEnvValue } from "@orb/tooling/_shared/process-env";
import type { HostSlotHolder, HostSlotLease, HostSlotPool } from "../contract/host-slots.ts";

refuseDirectInvocation(import.meta.url, "pnpm check (or pnpm test:ct <paths…>)");

/** The env var naming the per-USER runtime directory. ONE spelling, so the bash pool in
 *  `.claude/hooks/biome-check.sh` and this one demonstrably share a root. */
export const HOST_POOL_ROOT_ENV = "XDG_RUNTIME_DIR";

/** The host-wide pool root: per-USER, so every worktree and both accounts share it. `/tmp` is the fallback
 *  for a shell with no runtime dir (a cron/ssh context) and is host-wide too. */
export function hostPoolRoot(env?: NodeJS.ProcessEnv): string {
  // The ambient read goes through `_shared/proc.ts`'s `processEnvValue` — the fleet's ONE door for an
  // ambient tooling value — rather than growing another `process.env` policy site here.
  const runtime = env === undefined ? processEnvValue(HOST_POOL_ROOT_ENV) : env[HOST_POOL_ROOT_ENV];
  return runtime === undefined || runtime.trim() === "" ? "/tmp" : runtime;
}

/** This pool's directory. Named `orb-<name>-slots` so an operator listing `/run/user/<uid>` can see at a
 *  glance which fleet pools are live. */
export function hostPoolDir(pool: HostSlotPool, env?: NodeJS.ProcessEnv): string {
  return join(hostPoolRoot(env), `orb-${pool.name}-slots`);
}

function slotPath(dir: string, slot: number): string {
  return join(dir, `${String(slot)}.lock`);
}

/** A slot file or a queue ticket. Only a ticket carries `beatMs`, its last heartbeat. */
interface PoolRecord extends HostSlotHolder {
  readonly beatMs: number | null;
}

function readHolder(path: string): PoolRecord | null {
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
    };
  } catch {
    return null;
  }
}

/** `/proc` reports a process start in clock ticks since boot; USER_HZ is 100 on every Linux ABI. */
const USER_HZ = 100;
/** `starttime` is field 22 of `/proc/<pid>/stat`, which is index 19 once the `pid (comm) ` prefix is cut. */
const STAT_STARTTIME_INDEX = 19;
const BTIME_RE = /^btime (\d+)$/mu;

/** When the process now holding `pid` started, in epoch ms, or `null` when `/proc` cannot say (the pid is
 *  gone, or this is not Linux). `null` never makes a holder dead: `kill(pid, 0)` still decides. */
function readProcessStartMs(pid: number): number | null {
  // @orb-waive caught-failure-ownership(catch): the FAILURE IS THE ANSWER — a pid that exits between the liveness probe and this read, or a box with no `/proc`, has no start time to compare, and `null` makes the caller fall back to `kill(pid, 0)` alone, which is the pre-existing rule. Ends if a caller starts reading `null` as "reused".
  try {
    const stat = readFileSync(`/proc/${String(pid)}/stat`, "utf8");
    const ticks = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[STAT_STARTTIME_INDEX]);
    const btime = BTIME_RE.exec(readFileSync("/proc/stat", "utf8"))?.[1];
    return btime === undefined || !Number.isFinite(ticks) ? null : Number(btime) * MS_PER_SECOND + (ticks * MS_PER_SECOND) / USER_HZ;
  } catch {
    return null;
  }
}

/** The process table as this module reads it. Injected as ONE unit: a test that fakes `alive` gets no real
 *  `/proc` start times for its fake pids unless it fakes those too. */
interface Liveness {
  readonly alive: (pid: number) => boolean;
  readonly processStartMs: (pid: number) => number | null;
}

/** `/proc` start times are whole ticks and `btime` is whole seconds, so a genuine holder can read as
 *  starting up to about a second after its own record. */
const REUSE_TOLERANCE_MS = 2000;

type HolderState = "live" | "gone" | "reused";

function holderState(liveness: Liveness, holder: HostSlotHolder): HolderState {
  if (!liveness.alive(holder.pid)) {
    return "gone";
  }
  const recordedMs = Date.parse(holder.startedAt);
  const startMs = liveness.processStartMs(holder.pid);
  return startMs !== null && Number.isFinite(recordedMs) && startMs > recordedMs + REUSE_TOLERANCE_MS ? "reused" : "live";
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
  /** When the process behind `pid` started (epoch ms), or `null`. Defaults to a `/proc` read only when
   *  `alive` is not injected, so a faked process table never meets a real one. */
  readonly processStartMs?: (pid: number) => number | null;
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
  const waiter = openWaiter(pool, deps);
  let announced = false;
  let steals = 0;
  try {
    for (;;) {
      const nowMs = waiter.now().getTime();
      writeTicket(waiter.ticket, { pid: waiter.pid, startedAt: waiter.startedAt, label: pool.label, beatMs: nowMs });
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

/** One waiter's fixed facts, plus the highest ceiling it has already announced, so each notice prints once. */
interface Waiter {
  readonly pool: HostSlotPool;
  readonly dir: string;
  readonly queueDir: string;
  readonly ticket: string;
  readonly pid: number;
  readonly liveness: Liveness;
  readonly now: () => Date;
  readonly startedMs: number;
  readonly startedAt: string;
  readonly body: string;
  readonly ceilingMs: number;
  readonly slotPaths: readonly string[];
  readonly overflowPaths: readonly string[];
  readonly onNotice: ((message: string) => void) | undefined;
  noticedLevel: number;
}

function openWaiter(pool: HostSlotPool, deps: HostSlotDeps): Waiter {
  const now = deps.now ?? ((): Date => new Date());
  const pid = deps.pid ?? process.pid;
  const dir = hostPoolDir(pool, deps.env);
  const queueDir = join(dir, QUEUE_DIR);
  mkdirSync(queueDir, { recursive: true });
  const startedMs = now().getTime();
  const startedAt = new Date(startedMs).toISOString();
  return {
    pool,
    dir,
    queueDir,
    ticket: join(queueDir, `${String(startedMs).padStart(TICKET_MS_DIGITS, "0")}-${String(pid).padStart(TICKET_PID_DIGITS, "0")}${TICKET_SUFFIX}`),
    pid,
    liveness:
      deps.alive === undefined
        ? { alive: defaultAlive, processStartMs: deps.processStartMs ?? readProcessStartMs }
        : { alive: deps.alive, processStartMs: deps.processStartMs ?? ((): null => null) },
    now,
    startedMs,
    startedAt,
    body: `${JSON.stringify({ pid, startedAt, label: pool.label }, null, 2)}\n`,
    // The ceiling is LOAD-SCALED through the one policy: on a contended box the queue is legitimately
    // longer, and a ceiling written for a quiet box would admit the overflow run exactly when it matters most.
    ceilingMs: budget(pool.waitBaseMs),
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
  const overflow = { paths: waiter.overflowPaths.slice(0, level), body: waiter.body, liveness: waiter.liveness };
  const holders = liveHolders(waiter.slotPaths, waiter.liveness);
  let taken = takeAnySlot(overflow, waiter.onNotice);
  // A stolen overflow file is free now: take it in this poll instead of announcing a run that is gone.
  if (taken === "stole") {
    taken = takeAnySlot(overflow, waiter.onNotice);
  }
  if (typeof taken === "number") {
    waiter.onNotice?.(overflowNotice(waiter, holders, taken));
    return lease(overflow.paths[taken] ?? "", null, waiter.pid, waiter.now().getTime() - waiter.startedMs);
  }
  if (waiter.noticedLevel < level) {
    waiter.noticedLevel = level;
    const runs = liveHolders(overflow.paths, waiter.liveness).map(holderText).join("; ");
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
  const pids = holders.length === 0 ? "<pid>" : holders.map((holder) => String(holder.pid)).join(" ");
  return [
    index === 0
      ? `host pool "${waiter.pool.name}" still full after ${seconds(waiter.ceilingMs)}s, held by ${held}.`
      : `host pool "${waiter.pool.name}" past its hard ceiling of ${seconds(waiter.ceilingMs * (index + 1))}s: the holder (${held}) and the first overflow run are both still live.`,
    index === 0
      ? "Starting this run as the first overflow run; every later waiter stays queued behind it in arrival order."
      : "Starting this run as the last overflow run; no further run starts until one of these ends.",
    `If the holder is stuck, find its checkout with \`ps -o pid,etime,args -p ${pids}\` and \`readlink /proc/<pid>/cwd\`, then stop it from that checkout. Pool files: ${waiter.dir}`,
  ].join(" ");
}

/** Rewrite this waiter's ticket through a rename, so a reader never sees a torn record and prunes it. */
function writeTicket(path: string, ticket: PoolRecord): void {
  const tmp = `${path}.${String(ticket.pid)}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(ticket)}\n`);
  renameSync(tmp, path);
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
      // process start time instead.
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
