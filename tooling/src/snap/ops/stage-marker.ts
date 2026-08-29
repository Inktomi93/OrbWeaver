// THE SHARED, REPO-KEYED OWNERSHIP MARKER — <main-checkout>/.cache/snap-stage/active.json. Split out of
// ops/stage.ts when that file crossed the tooling line cap (docs/design/tooling-package.md §4.3); it is
// one command family, and the one every other stage module reads.
//
// Every function here takes the MARKER ROOT (`markerRoot(repoRoot())`), never a checkout root: that is the
// whole of issue #108. The band is ONE fixed port pair for the whole box, so its owner marker must be one
// file every checkout agrees on — `git rev-parse --git-common-dir` answers `<main>/.git` from every linked
// worktree. Stage DIRS stay per-checkout (they are worktrees of that checkout); only this ONE marker is
// shared, and it names the checkout its dir belongs to.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { runNicedSync } from "../../_shared/proc.ts";
import type { ActiveStage } from "../contract/stage.ts";
import { ACTIVE_REL, markerRootFromCommonDir, STAGE_ROOT_REL } from "../lib/stage-plan.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

export function markerRoot(root: string): string {
  const res = runNicedSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: root });
  // No git answer at all ⇒ keep the marker local: a per-checkout marker is worse than none, but a marker
  // written to a guessed path would be invisible to every reader including this one.
  return res.status === 0 ? markerRootFromCommonDir(res.stdout) : root;
}

function activePath(markerHome: string): string {
  return join(markerHome, ACTIVE_REL);
}

export function readActive(markerHome: string): ActiveStage | null {
  const p = activePath(markerHome);
  if (!existsSync(p)) {
    return null;
  }
  // @orb-gate-ignore caught-failure-ownership(default:catch): optional-read-as-absent — a truncated/garbage marker is treated as "no active stage", triggering the same clean-rebuild path a missing marker takes. Ends if the sweep/status readers stop tolerating a null marker.
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8")) as Partial<ActiveStage>;
    // A marker with no owner cannot be reasoned about across checkouts (it predates #108, or is
    // hand-written): treat it exactly like a truncated one — no marker, and the port-probe path decides.
    if (typeof parsed.checkout !== "string") {
      return null;
    }
    // A marker written before the #324 heartbeat existed has no `lastUsedAt`. Backfill it from the boot
    // stamp rather than leaving it undefined: every reader (the sweep, the status line) then works on a
    // total shape, and the boot stamp is the honest floor — it can only make such a stage look OLDER.
    return { ...parsed, lastUsedAt: parsed.lastUsedAt ?? parsed.startedAt } as ActiveStage;
  } catch {
    // A truncated/garbage marker (a killed mid-write) is treated as "no active stage" → a clean rebuild.
    return null;
  }
}

/** Exported beside `readActive` because the pair IS the cross-checkout contract (#108): the suite proves
 *  a marker written under one checkout's `markerRoot` is read back under another's. */
export function writeActive(markerHome: string, a: ActiveStage): void {
  mkdirSync(join(markerHome, STAGE_ROOT_REL), { recursive: true });
  writeFileSync(activePath(markerHome), `${JSON.stringify(a, null, 2)}\n`);
}

/** Stamp the heartbeat (#324) without disturbing anything else the marker says — called on every boot AND
 *  every reuse, including a `shared-reuse` of a SIBLING checkout's stage: the band's liveness is USE, and
 *  our use is as good as theirs. A missing/unreadable marker is a no-op (there is nothing to keep alive). */
export function touchActive(markerHome: string, nowIso: string): void {
  const active = readActive(markerHome);
  if (active !== null) {
    writeActive(markerHome, { ...active, lastUsedAt: nowIso });
  }
}

export function clearActive(markerHome: string): void {
  rmSync(activePath(markerHome), { force: true });
}
