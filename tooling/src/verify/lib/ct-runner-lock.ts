// CONCURRENT CT RUNS IN ONE WORKTREE (#1581) — the per-invocation build cache and the exclusion lock.
//
// THE DEFECT. `pnpm test:ct` = `cli.ts scoped-test ct`, and its ct arm used to `rm -rf playwright/.cache`
// and rebuild there — ONE shared directory per worktree, whatever else was running. Two runners in the same
// tree therefore corrupt each other: the second's clear+rebuild lands under the first's live vite server, and
// the first reports FAILURES IN TESTS IT NEVER TOUCHED. Measured 2026-09-04 in one worktree: `201/2` with the
// two reds at `rpg-context-section.ct.tsx:738,:754`, then `203/203` for the same file set alone at the same
// box load. No instrument said anything — the corrupted run printed an ordinary CT SUMMARY, which is the
// lying-tool shape this repo fixes on sight.
//
// TWO HALVES, both required:
//   1. THE REAL FIX — `ctCacheDir` (a playwright-ct `use` knob, `@playwright/experimental-ct-core`'s
//      viteUtils.resolveDirs: `use.ctCacheDir ? resolve(configDir, use.ctCacheDir) : resolve(templateDir,
//      ".cache")`) is minted PER INVOCATION under `.cache/ct/` and removed on exit. Two runs cannot share a
//      build dir even when the lock below is bypassed, and the old "clear the cache first" property is
//      preserved BY CONSTRUCTION: a brand-new directory is an empty cache.
//   2. THE CHEAP GUARD — a lockfile, so a second runner in the SAME worktree is DETECTED and refuses loudly
//      (exit-2 class, naming the live pid and the remedy) instead of silently racing. It is a guard, not the
//      fix: the two runners would still share the CT vite port, so the honest answer is "wait, or run the
//      other one elsewhere with its own CT_PORT".
//
// STALE LOCKS SELF-HEAL: a killed run leaves its file behind, and a lock nobody holds must never wedge the
// next run — so an unheld lock (its pid is gone) is STOLEN with a printed note, never obeyed.
//
// A THIRD CAP JOINED THEM (#1835): a HOST-WIDE slot pool, `ctRunnersHostWide` slots under
// $XDG_RUNTIME_DIR. Everything above is about ONE WORKTREE, and the #1835 finding was precisely that
// every cap on the tree was per-worktree: six lanes across two accounts each ran their own CT fleet, and
// node_load1 peaked at 105.8 on 24 cores with the co-hosted homelab starved. The two caps answer
// different questions and therefore behave differently — the local one REFUSES a corrupting sibling, the
// host one WAITS for a busy box. `acquireCtRunnerSlots` is the door that composes them; its doc states
// why in full.
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { checkoutName } from "@orb/tooling/_shared/artifacts";
import { readConcurrencyProfile, readStageBudgets } from "@orb/tooling/_shared/concurrency-profile";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import type { RunMarkerDeps } from "@orb/tooling/_shared/run-marker";
import { describeRunMarkerSweep, inheritedRunMarker, mintRunMarker, sweepAbandonedRunMarkers, sweepRunMarkerNow } from "@orb/tooling/_shared/run-marker";
import type { CtRunnerLock, CtRunnerLockRecord } from "../contract/scoped-test.ts";
import type { HostSlotDeps } from "./host-slots.ts";
import { acquireHostSlot } from "./host-slots.ts";

refuseDirectInvocation(import.meta.url, "pnpm test:ct <paths…>");

/** The shared per-worktree CT directory: every invocation's build cache, plus the exclusion lock. */
export const CT_RUN_DIR_REL = join(".cache", "ct");
const LOCK_NAME = "runner.lock";

export function ctRunnerLockPath(root: string): string {
  return join(root, CT_RUN_DIR_REL, LOCK_NAME);
}

/** This invocation's build cache. Keyed by pid + start time: two runs of the same tree can never collide,
 *  and a leftover directory names the run that left it. */
function ctCacheDirFor(root: string, id: string): string {
  return join(root, CT_RUN_DIR_REL, `build-${id}`);
}

function readLock(path: string): CtRunnerLockRecord | null {
  // @orb-waive caught-failure-ownership(catch): the FAILURE IS THE VERDICT — an unreadable lockfile is DEBRIS, and `null` is how this reader says so to its one caller, which then STEALS the lock and PRINTS that it did. Surfacing it any other way wedges the tree on a half-written file. Ends if a caller starts reading `null` as "someone holds this".
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const pid = (parsed as Record<string, unknown>)["pid"];
    const startedAt = (parsed as Record<string, unknown>)["startedAt"];
    const argv = (parsed as Record<string, unknown>)["argv"];
    if (typeof pid !== "number") {
      return null;
    }
    return { pid, startedAt: typeof startedAt === "string" ? startedAt : "unknown", argv: typeof argv === "string" ? argv : "" };
  } catch {
    // A malformed or half-written lock is not a holder — it is debris, and treating it as a holder would
    // wedge the tree forever. The caller steals it exactly as it steals a dead pid's.
    return null;
  }
}

/** Is the recorded holder still alive? `kill(pid, 0)` is the question, not a signal. */
function holderAlive(pid: number, alive: (pid: number) => boolean): boolean {
  return pid > 1 && alive(pid);
}

function defaultAlive(pid: number): boolean {
  // @orb-waive caught-failure-ownership(catch): `kill(pid, 0)` ASKS A QUESTION and throws to answer "no" — the throw IS the ESRCH answer, not a lost failure, and the caller acts on the boolean by stealing the lock and saying so out loud. Ends if this ever needs to distinguish EPERM (a live foreign pid) from ESRCH, which would make the throw carry two answers.
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    // ESRCH (gone) — and EPERM (alive, someone else's) cannot be distinguished here without a second
    // syscall shape, so a foreign pid reads as GONE and its lock is stolen. That is the safe direction:
    // this lock exists to catch OUR OWN second runner, and refusing forever on a recycled pid would be a
    // wedge the operator cannot clear.
    return false;
  }
}

function ctRunnerBusyRefusal(holder: CtRunnerLockRecord): string {
  return (
    `a second \`pnpm test:ct\` is LIVE in this worktree (pid ${String(holder.pid)}, started ${holder.startedAt}) — ` +
    "two CT runners in one tree corrupt each other's build (#1581), so this one is refusing instead of racing. " +
    "Wait for it to finish, or run this batch from a DIFFERENT worktree with its own `CT_PORT=<free port>` " +
    `(the CT vite port is box-wide). If that pid is gone, delete ${join(CT_RUN_DIR_REL, LOCK_NAME)}.`
  );
}

export interface CtRunnerLockDeps {
  readonly now?: () => Date;
  readonly pid?: number;
  readonly alive?: (pid: number) => boolean;
  readonly argv?: readonly string[];
  /** Injected /proc + signal seams for the marker sweeps (#1848) — a test drives them without a box. */
  readonly marker?: RunMarkerDeps;
  /** Where a sweep's receipt goes. The runner passes its `warn` channel; a test collects the lines. */
  readonly notice?: (message: string) => void;
}

/** A CT batch is minutes, and a second lane legitimately waits that long for a host slot rather than being
 *  refused. Load-scaled at acquire time; past it the pool degrades to uncapped, never to a wedge.
 *
 *  THE NUMBER IS THE PROFILE'S (#1848), not a second literal: the wait a queued run may spend is spent
 *  INSIDE the verify stage's own wall clock, so the stage's hang ceiling is derived from this same row
 *  (`stageBudgets.ctHostSlotWaitMinutes`). Two hand-typed 45s would have drifted the day either moved. */
function ctHostWaitBaseMs(): number {
  return readStageBudgets().ctHostWaitMs;
}

/** THE DOOR the runner uses. TWO caps, in this order, because they answer two different questions:
 *
 *  1. the per-WORKTREE lock (below) — "is another runner about to corrupt MY build directory?" It REFUSES,
 *     instantly, because the answer to a corrupting sibling is not to wait for it (#1581).
 *  2. the host-wide SLOT (#1835) — "are there already `ctRunnersHostWide` chromium fleets on this BOX?"
 *     It WAITS, because the answer to a busy box IS to wait: a refused CT run is an exit-2 tool error in a
 *     lane, which breaks a merge train and costs a re-dispatch, while waiting costs only wall clock. Six
 *     lanes × 4 workers × 1 chromium each is what drove node_load1 to 105.8 with nothing saying a word.
 *
 *  The host slot is taken AFTER the worktree lock so a doomed run (a live sibling in the same tree) never
 *  occupies a host slot it will immediately give back. `release()` frees both, in reverse order. */
export async function acquireCtRunnerSlots(root: string, deps: CtRunnerLockDeps & { readonly host?: HostSlotDeps } = {}): Promise<CtRunnerLock> {
  const local = acquireCtRunnerLock(root, deps);
  if (local.kind === "busy") {
    return local;
  }
  // THE ABANDONED SWEEP (#1848), before this run adds its own fleet to the box: a marked process whose
  // OWNER RUN is gone cannot have anything waiting on it. This is the arm that covers the kill a runner
  // cannot handle (SIGKILL, an OOM, a lane torn down) — the state that left 72 chrome-headless-shell
  // processes, some 40h old, alive on this box on 2026-09-06. A LIVE sibling's fleet answers for itself
  // and is never touched.
  for (const sweep of await sweepAbandonedRunMarkers(deps.marker)) {
    const line = describeRunMarkerSweep(sweep);
    if (line !== null) {
      deps.notice?.(`CT RUNNER SWEPT   ${line} — its run is gone, so nothing was waiting on them.`);
    }
  }
  const host = await acquireHostSlot(
    {
      name: "ct",
      label: `test:ct ${checkoutName(root)}`,
      slots: readConcurrencyProfile().ctRunnersHostWide,
      waitBaseMs: ctHostWaitBaseMs(),
    },
    deps.host,
  );
  return {
    kind: "held",
    lease: {
      ...local.lease,
      hostSlot: host.slot,
      hostWaitedMs: host.waitedMs,
      release: (): void => {
        host.release();
        local.lease.release();
      },
    },
  };
}

/** Take the worktree's CT runner lock, or report who holds it. On success the caller owns a fresh build
 *  cache and MUST `release()` (a `finally`, so a refused preflight frees it too). This is the LOCAL half;
 *  the runner's real door is {@link acquireCtRunnerSlots}, which adds the host-wide cap. */
export function acquireCtRunnerLock(root: string, deps: CtRunnerLockDeps = {}): CtRunnerLock {
  const now = deps.now ?? ((): Date => new Date());
  const pid = deps.pid ?? process.pid;
  const alive = deps.alive ?? defaultAlive;
  const lockPath = ctRunnerLockPath(root);
  mkdirSync(join(root, CT_RUN_DIR_REL), { recursive: true });
  const record: CtRunnerLockRecord = { pid, startedAt: now().toISOString(), argv: (deps.argv ?? []).join(" ") };
  const body = `${JSON.stringify(record, null, 2)}\n`;
  let stolenFrom: number | null = null;
  // `wx` is the whole mechanism: an EXCLUSIVE create is atomic, so two runners racing this line cannot both
  // win. A pre-read-then-write would have a window exactly the size of the defect.
  // @orb-waive caught-failure-ownership(catch): the EEXIST throw IS "the lock is held" — this catch is the arm that reads the holder and either REFUSES loudly (`kind: "busy"`; the caller prints the refusal and exits 2) or steals a dead holder's lock with a printed note. Every path out of it is owned and visible. Ends if this stops re-deciding and starts swallowing.
  try {
    writeFileSync(lockPath, body, { flag: "wx" });
  } catch {
    const holder = readLock(lockPath);
    if (holder !== null && holderAlive(holder.pid, alive)) {
      return { kind: "busy", holder, refusal: ctRunnerBusyRefusal(holder) };
    }
    stolenFrom = holder === null ? null : holder.pid;
    unlinkSync(lockPath);
    writeFileSync(lockPath, body, { flag: "wx" });
  }
  const cacheDir = ctCacheDirFor(root, `${String(pid)}-${String(now().getTime())}`);
  mkdirSync(cacheDir, { recursive: true });
  // INHERIT before minting (#1848): inside `pnpm verify`, the stage child already carries the run's
  // marker, and stamping a second one over it would hide these browsers from the RUNNER's kill path —
  // the exact hole being closed. Alone (a lane's `pnpm test:ct`), this run is its own owner.
  const runMarker = inheritedRunMarker() ?? mintRunMarker(pid, now().getTime());
  // …AND THE LEASE, MINTED, NEVER INHERITED (#2504). The marker above answers "which run may kill me"; this
  // answers "what did I start", and only the second is ours to sweep at release. They are stamped together
  // on every child, so #1848's reach is unchanged and the release's blast radius is this invocation.
  const runLease = mintRunMarker(pid, now().getTime());
  let released = false;
  return {
    kind: "held",
    lease: {
      cacheDir,
      runMarker,
      runLease,
      stolenFrom,
      release: (): void => {
        if (released) {
          return;
        }
        released = true;
        // A browser still carrying THIS LEASE after playwright has returned is an ORPHAN by construction:
        // the run that minted the lease is over. Synchronous SIGKILL, because `release` runs in a `finally`
        // nobody awaits — the polite TERM+grace form belongs to the timeout path, which has time for it.
        // THE LEASE, NOT `runMarker` (#2504): "its run is over" is true of a value this invocation MINTED
        // and false of one it INHERITED, and sweeping the inherited one killed the outer run that owned it.
        const line = describeRunMarkerSweep(sweepRunMarkerNow(runLease, deps.marker));
        if (line !== null) {
          deps.notice?.(`CT RUNNER SWEPT   ${line}`);
        }
        rmSync(cacheDir, { recursive: true, force: true });
        // Only OUR record is removed — a lock a later runner legitimately re-created is not ours to delete.
        const current = readLock(lockPath);
        if (existsSync(lockPath) && (current === null || current.pid === pid)) {
          rmSync(lockPath, { force: true });
        }
      },
    },
  };
}
