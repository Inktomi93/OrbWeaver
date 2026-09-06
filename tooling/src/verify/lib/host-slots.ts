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
// that finds every slot held WAITS, announcing who it is behind, and if the wait exceeds its (load-scaled)
// ceiling it PROCEEDS ANYWAY with a loud notice rather than dying: a stuck pool must degrade to the old
// uncapped behaviour, never to a wedge.
//
// STALE SLOTS SELF-HEAL, same shape as ct-runner-lock.ts: a killed holder leaves its file behind, and a
// slot nobody holds must never wedge the box, so an unheld slot (its pid is gone) is STOLEN with a printed
// note. `kill(pid, 0)` cannot tell EPERM (a live foreign pid) from ESRCH (gone), so a foreign pid reads as
// GONE and its slot is taken — the safe direction, since these pools only ever contend with our own fleet
// and refusing forever on a recycled pid is a wedge an operator cannot clear.
//
// THE VOCABULARY IS THE CALLER'S. This module decides WHEN a caller is queued, has acquired, or has given
// up waiting; the SENTENCES belong to the caller (`verify: queued behind pid …` reads nothing like
// `ct: waiting for a host CT slot`). One mechanism, two dialects.
//
// NOT SHARED WITH THE EDIT HOOK'S POOL, deliberately: `.claude/hooks/biome-check.sh` is bash and uses
// `flock` under the same `$XDG_RUNTIME_DIR` root. Same policy, different language; the shared thing is the
// directory convention and the profile that sizes both.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { budget } from "@orb/tooling/_shared/load-budget";
import type { HostSlotHolder, HostSlotLease, HostSlotPool } from "../contract/host-slots.ts";

refuseDirectInvocation(import.meta.url, "pnpm check (or pnpm ct:scoped <paths…>)");

/** The env var naming the per-USER runtime directory. ONE spelling, so the bash pool in
 *  `.claude/hooks/biome-check.sh` and this one demonstrably share a root. */
export const HOST_POOL_ROOT_ENV = "XDG_RUNTIME_DIR";

/** The host-wide pool root: per-USER, so every worktree and both accounts share it. `/tmp` is the fallback
 *  for a shell with no runtime dir (a cron/ssh context) and is host-wide too. */
export function hostPoolRoot(env: NodeJS.ProcessEnv = ambientEnv()): string {
  const runtime = env[HOST_POOL_ROOT_ENV];
  return runtime === undefined || runtime.trim() === "" ? "/tmp" : runtime;
}

function ambientEnv(): NodeJS.ProcessEnv {
  // biome-ignore lint/style/noProcessEnv: XDG_RUNTIME_DIR is the OS's own per-user runtime directory, not app config, and the app's env door sits ABOVE @orb/tooling in the cake.
  return process.env;
}

/** This pool's directory. Named `orb-<name>-slots` so an operator listing `/run/user/<uid>` can see at a
 *  glance which fleet pools are live. */
export function hostPoolDir(pool: HostSlotPool, env?: NodeJS.ProcessEnv): string {
  return join(hostPoolRoot(env), `orb-${pool.name}-slots`);
}

function slotPath(dir: string, slot: number): string {
  return join(dir, `${String(slot)}.lock`);
}

function readHolder(path: string): HostSlotHolder | null {
  // @orb-gate-ignore caught-failure-ownership(default:catch): the FAILURE IS THE VERDICT — an unreadable or half-written slot file is DEBRIS, and `null` is how this reader says so to its one caller, which then STEALS the slot and PRINTS that it did. Any other surfacing wedges the box on a torn write. Ends if a caller starts reading `null` as "someone holds this".
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
    };
  } catch {
    return null;
  }
}

function defaultAlive(pid: number): boolean {
  // @orb-gate-ignore caught-failure-ownership(default:catch): `kill(pid, 0)` ASKS A QUESTION and throws to answer "no" — the throw IS the ESRCH answer, not a lost failure, and the caller acts on the boolean by stealing the slot and saying so out loud. Ends if this ever needs to distinguish EPERM from ESRCH.
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms).unref();
  });
}

/** How often a blocked caller re-checks. Long enough to cost nothing (a whole verify run is minutes), short
 *  enough that a freed slot is picked up promptly. */
const POLL_MS = 2000;
const MS_PER_SECOND = 1000;

export interface HostSlotDeps {
  readonly now?: () => Date;
  readonly pid?: number;
  readonly alive?: (pid: number) => boolean;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly env?: NodeJS.ProcessEnv;
  /** Called ONCE, the first time every slot is held, with the holder this caller is queued behind. The
   *  caller owns the sentence — see the module header. */
  readonly onQueued?: (holder: HostSlotHolder) => void;
  /** Called when a dead holder's slot was stolen, and when the wait ceiling was reached and the caller is
   *  proceeding UNSLOTTED. Both are self-healing events that must never be silent. */
  readonly onNotice?: (message: string) => void;
}

/** THE DOOR. Take one of `pool.slots` host-wide slots, waiting for one if they are all live.
 *
 *  The returned lease ALWAYS lets the caller proceed — `slot` is `null` when the ceiling was reached and
 *  the pool degraded to uncapped. `release()` is idempotent and only removes a slot file that still names
 *  us: a slot a later run legitimately re-created is not ours to delete. */
export async function acquireHostSlot(pool: HostSlotPool, deps: HostSlotDeps = {}): Promise<HostSlotLease> {
  const now = deps.now ?? ((): Date => new Date());
  const pid = deps.pid ?? process.pid;
  const alive = deps.alive ?? defaultAlive;
  const sleep = deps.sleep ?? defaultSleep;
  const dir = hostPoolDir(pool, deps.env);
  mkdirSync(dir, { recursive: true });
  const body = `${JSON.stringify({ pid, startedAt: now().toISOString(), label: pool.label }, null, 2)}\n`;
  // The ceiling is LOAD-SCALED through the one policy: on a contended box the queue is legitimately longer,
  // and a ceiling written for a quiet box would make the pool degrade exactly when it matters most.
  const ceilingMs = budget(pool.waitBaseMs);
  const startedMs = now().getTime();
  let announced = false;

  for (;;) {
    const slot = takeAnySlot({ dir, slots: pool.slots, body, pid, alive }, deps.onNotice);
    if (slot !== null) {
      return lease(slotPath(dir, slot), slot, pid, now().getTime() - startedMs);
    }
    const first = liveHolders(dir, pool.slots, alive)[0];
    if (!announced && first !== undefined) {
      announced = true;
      deps.onQueued?.(first);
    }
    if (now().getTime() - startedMs >= ceilingMs) {
      deps.onNotice?.(
        `host pool "${pool.name}" still full after ${String(Math.round(ceilingMs / MS_PER_SECOND))}s — PROCEEDING UNSLOTTED rather than refusing. A stuck pool degrades to the old uncapped behaviour, never to a wedge; if this repeats, look for an abandoned holder in ${dir}.`,
      );
      return { slot: null, waitedMs: now().getTime() - startedMs, release: (): void => undefined };
    }
    await sleep(POLL_MS);
  }
}

interface SweepInput {
  readonly dir: string;
  readonly slots: number;
  readonly body: string;
  readonly pid: number;
  readonly alive: (pid: number) => boolean;
}

/** ONE sweep across the pool: the slot number taken, or `null` when every slot is held by a LIVE holder. A
 *  dead holder's slot is cleared here (with its notice) and re-attempted on the next sweep rather than
 *  written straight away — another waiter may have won the same steal, and a second `wx` is how we find
 *  that out without a second race. */
function takeAnySlot(input: SweepInput, onNotice: ((message: string) => void) | undefined): number | null {
  for (let slot = 1; slot <= input.slots; slot += 1) {
    const path = slotPath(input.dir, slot);
    // `wx` is the whole mechanism: an EXCLUSIVE create is atomic, so two runners racing this line cannot
    // both win. A pre-read-then-write would have a window exactly the size of the defect.
    // @orb-gate-ignore caught-failure-ownership(empty:catch): the EEXIST throw IS "this slot is taken" — the catch arm reads the holder and either moves to the next slot (live) or STEALS the slot with a printed note (dead). Every path out of it is owned and visible. Ends if this stops re-deciding and starts swallowing.
    try {
      writeFileSync(path, input.body, { flag: "wx" });
      return slot;
    } catch {
      const holder = readHolder(path);
      if (holder !== null && holder.pid !== input.pid && input.alive(holder.pid)) {
        continue;
      }
      const who = holder === null ? "an unreadable record" : `pid ${String(holder.pid)} (no such process)`;
      onNotice?.(`host slot ${String(slot)}/${String(input.slots)} in ${input.dir} was held by ${who} — stealing it; a dead holder must never wedge the box.`);
      rmSync(path, { force: true });
    }
  }
  return null;
}

/** Every slot's live holder, in slot order — the list a caller's "queued behind" sentence is built from. */
function liveHolders(dir: string, slots: number, alive: (pid: number) => boolean): readonly HostSlotHolder[] {
  const holders: HostSlotHolder[] = [];
  for (let slot = 1; slot <= slots; slot += 1) {
    const holder = readHolder(slotPath(dir, slot));
    if (holder !== null && alive(holder.pid)) {
      holders.push(holder);
    }
  }
  return holders;
}

function lease(path: string, slot: number, pid: number, waitedMs: number): HostSlotLease {
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
