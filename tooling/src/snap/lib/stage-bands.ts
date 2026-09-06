// THE BAND TABLE's pure derivations (docs/design/1208-instrument-substrate.md §3.6, issue #1276): the
// owner-ruled limits, the strand rule with its live-session fence, the ALLOCATOR that hands a lane its own
// band, the exhaustion refusal, and the three-probe health verdict. No I/O — ops/stage-marker.ts reads and
// writes the table, ops/stage-probe.ts observes the box, ops/stage.ts orchestrates. Split from
// lib/stage-plan.ts (which keeps ports/paths/access/refusals) at the tooling line cap, §4.3.
//
// WHY AN ALLOCATOR AT ALL. Before this, `snap --isolated` had ONE port pair, so a second lane wanting a
// stage was a refusal by construction: four lanes were blocked in a single afternoon (2026-09-02,
// p-home-perf ×3 · p-quiet-checked · p-audit-blind). `_shared/ports.ts` declares ten bands with a proven
// disjointness pin; this module is what turns that range into "every lane gets its own stage".
//
// THE ORDER IS THE SPEC'S, AND IT IS NOT ARBITRARY (§3.6):
//   1. the caller's OWN row for (checkout, sha) — a lane re-driving its stage must land back on it, or
//      every call would boot a second copy of the same tree;
//   2. a `shared-reuse` row at the same sha — a sibling's frozen worktree at our commit serves identical
//      bytes, so pointing at it read-only is strictly cheaper than a 55 s boot (#108);
//   3. the lowest FREE band — private by construction, no contention with anyone;
//   4. the lowest STRANDED row — lazy reap-on-acquire (#1163 arm a): a forgotten stage is reclaimed by the
//      next lane that needs a band. This arm is unchanged, but its ORIGINAL rationale is not: it used to
//      read "not by a background reaper nobody runs", and 2026-09-05 measured the cost of that being the
//      ONLY arm — three bands stranded 2h56m / 4h51m / 1h37m with live stacks resident, because no lane
//      asked for a band all afternoon. #1163 arm (b) now gives each stage its OWN idle timer
//      (lib/stage-keeper-plan.ts + ops/stage-keeper.ts). This arm remains the BACKSTOP, deliberately: it
//      reads `lastUsedAt` alone and never asks the timer's questions, so a band whose keeper died is
//      reclaimed here exactly as it always was;
//   5. exhaustion — exit 2 NAMING EVERY ROW with its idle age. A refusal that says which lane holds what
//      is an operator's next action; a bare "no bands free" is a mystery.
import type {
  StageAllocation,
  StageBandView,
  StageHealth,
  StageHealthEvidence,
  StageLimits,
  StageRow,
  StageSweepEvidence,
  StageSweepVerdict,
} from "../contract/stage.ts";
import { bandAccess, describeStageAgePhrase, shortSha, stageIdleMs } from "./stage-plan.ts";

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

// ── the owner-ruled limits (design §12.2 F5) ──────────────────────────────────────────────────────────

/** Stage idle TTL: 60 minutes (F5 — deliberately double the session's 30, because a stage is expensive to
 *  rebuild and a visual campaign snaps the same warm stage across an hour). NOT load-scaled: a TTL belongs
 *  to §7.1's IDLE class, and idle is not load. */
export const DEFAULT_STAGE_TTL_MIN = 60;
/** Live stages per box, across every checkout (F5). The band RANGE is 10; the CAP is what keeps ten
 *  full-priority stacks off a box that also serves the operator's dev stack and a co-hosted homelab.
 *
 *  THIS IS THE FALLBACK, NOT THE ANSWER (#1848). The cap's base now comes from
 *  `tooling/concurrency-profile.json` — THE ONE HOME for every cap since #1835, which this one was missed
 *  by: `ORB_DEDICATED_BOX=1` retuned vitest and CT workers and left the stage cap at the shared-host 3, so
 *  a box with no co-tenant still refused a fourth stage. A caller that supplies no base gets this number,
 *  which keeps the pure function usable from a test without a profile file. */
export const DEFAULT_STAGE_CAP = 3;

/** Env \> profile \> default, mirroring `resolveSessionLimits`. A non-positive or unparseable value is a
 *  REFUSAL, never a silent default — a stage TTL that silently became 60 min is the strand class this table
 *  exists to end. `capBase` is the PROFILE's cap (the imperative caller reads it); `ORB_STAGE_CAP` still
 *  wins over both, because the contract text has always promised an env override. */
export function resolveStageLimits(input: { readonly ttlMinEnv: string | undefined; readonly capEnv: string | undefined; readonly capBase?: number }): {
  readonly limits: StageLimits;
  readonly errors: readonly string[];
} {
  const errors: string[] = [];
  let ttlMin = DEFAULT_STAGE_TTL_MIN;
  if (input.ttlMinEnv !== undefined && input.ttlMinEnv !== "") {
    ttlMin = Number(input.ttlMinEnv);
    if (!(Number.isFinite(ttlMin) && ttlMin > 0)) {
      errors.push(`ORB_STAGE_TTL_MIN must be a positive number of minutes, got ${JSON.stringify(input.ttlMinEnv)}`);
      ttlMin = DEFAULT_STAGE_TTL_MIN;
    }
  }
  let cap = input.capBase ?? DEFAULT_STAGE_CAP;
  if (input.capEnv !== undefined && input.capEnv !== "") {
    cap = Number(input.capEnv);
    if (!(Number.isInteger(cap) && cap >= 1)) {
      errors.push(`ORB_STAGE_CAP must be an integer >= 1, got ${JSON.stringify(input.capEnv)}`);
      // Back to the PROFILE's cap, not the module default: a bad env value must not also discard the
      // box's configured answer.
      cap = input.capBase ?? DEFAULT_STAGE_CAP;
    }
  }
  return { limits: { ttlMs: Math.ceil(ttlMin * MS_PER_MINUTE), cap }, errors };
}

// ── the strand rule ───────────────────────────────────────────────────────────────────────────────────

/** Whether whatever holds THIS band right now has outlived its use. Pure — the caller observes the band,
 *  the process root, the process age and which of the row's sessions are alive.
 *
 *  THE LIVE-SESSION FENCE IS THE POINT. A stage bound to a session that is still alive is in use even when
 *  no snap CLI call has touched it for an hour: the daemon is driving it. Reaping such a row would kill a
 *  lane's browser mid-drive, which is worse than never reaping at all — so a live session ref pins the row
 *  `live` BEFORE the idle age is even read (§3.6). */
export function stageSweepVerdict(evidence: StageSweepEvidence, ttlMs: number): StageSweepVerdict {
  if (!evidence.bandBound) {
    return "unbound";
  }
  // The one hard fence: a bound band that is not a stage's is somebody else's server. Never ours to kill.
  if (!evidence.bandIsStageRooted) {
    return "live";
  }
  // A live daemon normally fences its band. Once that daemon has recorded the stage DEAD, the fence has
  // served its purpose: the stage is unusable and sweep must free it immediately, not one TTL later.
  if (evidence.row?.dead !== undefined) {
    return "stranded";
  }
  if (evidence.liveSessions.length > 0) {
    return "live";
  }
  if (evidence.row === null) {
    // Lost row: no heartbeat exists, so the process's own age is the only honest signal. `ps` refusing
    // to answer is NOT evidence of age — leave it alone and let `--stage-down` be the deliberate remedy.
    const ageSeconds = evidence.bandProcessAgeSeconds;
    return ageSeconds !== null && ageSeconds * MS_PER_SECOND > ttlMs ? "stranded" : "live";
  }
  return stageIdleMs(evidence.row, evidence.nowMs) > ttlMs ? "stranded" : "live";
}

/** Does a row name a stage that is NOT running? The dangling `active.json` of #324 (measured on the live
 *  tree 2026-08-22: a 42h-old marker whose band had been free for two days — `--stage-status` showed a
 *  stage, `ss` showed nothing, and every reader had to reconcile that by hand). It is the same corpse
 *  `bandAccess` already rules a `take-over`, so reconciling it costs a rebuild at worst and never a kill. */
export function rowIsDangling(row: StageRow | null, verdict: StageSweepVerdict): boolean {
  return verdict === "unbound" && row !== null;
}

/** A view's strand verdict, from the same evidence the sweep judges — the allocator's reap candidate test.
 *  A view with no row but a bound band is NEVER reapable here: the allocator cannot identify what it would
 *  be killing, and `--stage-sweep` (which reads the process age) is the deliberate path for that case. */
function viewIsStranded(view: StageBandView, nowMs: number, ttlMs: number): boolean {
  if (view.row === null) {
    return false;
  }
  if (view.row.dead !== undefined) {
    return true;
  }
  return (
    stageSweepVerdict(
      {
        row: view.row,
        bandBound: view.bandBound,
        // A row whose band is bound by something unidentifiable stays out of reach; a row whose band is
        // UNBOUND is a corpse, and `stageSweepVerdict` calls that `unbound`, handled by the caller below.
        bandIsStageRooted: view.bandIsStageRooted,
        bandProcessAgeSeconds: null,
        liveSessions: view.liveSessions,
        nowMs,
      },
      ttlMs,
    ) === "stranded" ||
    // The dangling half: the row's band is not bound at all, so there is no process to kill and the row is
    // pure residue. Free by construction — but still a REAP, because the dir and the row must be cleared.
    (!view.bandBound && view.liveSessions.length === 0)
  );
}

// ── the allocator ─────────────────────────────────────────────────────────────────────────────────────

export function allocateStageBand(input: {
  readonly views: readonly StageBandView[];
  readonly checkout: string;
  readonly targetSha: string;
  readonly dirty: boolean;
  readonly fresh: boolean;
  readonly limits: StageLimits;
  readonly nowMs: number;
}): StageAllocation {
  const ordered = [...input.views].sort((a, b) => a.band - b.band);
  const occupied = ordered.filter((view): view is StageBandView & { readonly row: StageRow } => view.row !== null);

  const own = occupied.find((view) => view.row.checkout === input.checkout && view.row.sha === input.targetSha);
  if (own !== undefined) {
    return { kind: "ours", band: own.band, row: own.row };
  }

  const shared = occupied.find(
    (view) =>
      bandAccess({
        row: view.row,
        checkout: input.checkout,
        targetSha: input.targetSha,
        dirty: input.dirty,
        fresh: input.fresh,
        bandBound: view.bandBound,
        healthy: view.healthy,
      }) === "shared-reuse",
  );
  if (shared !== undefined) {
    return { kind: "shared-reuse", band: shared.band, row: shared.row };
  }

  // The CAP is judged only for arms that would ADD a stage: reusing our own row and sharing a sibling's
  // add nothing to the box's load, so a cap of 1 must never block the lane that already holds the stage.
  const liveStages = occupied.filter((view) => !viewIsStranded(view, input.nowMs, input.limits.ttlMs)).length;
  if (liveStages >= input.limits.cap) {
    return { kind: "exhausted", refusal: stageCapRefusal(occupied.length, ordered, input.limits, input.nowMs) };
  }

  const free = ordered.find((view) => view.row === null && !view.bandBound);
  if (free !== undefined) {
    return { kind: "free", band: free.band };
  }

  const stranded = occupied.find((view) => viewIsStranded(view, input.nowMs, input.limits.ttlMs));
  if (stranded !== undefined) {
    return { kind: "reap", band: stranded.band, row: stranded.row };
  }

  return { kind: "exhausted", refusal: stageRangeRefusal(ordered, input.nowMs) };
}

/** One `--stage-status`-shaped line per band, reused by both refusals and by the status read itself, so a
 *  reader sees the SAME census whether they asked or were refused. */
export function describeStageBandRow(view: StageBandView, nowMs: number): string {
  if (view.row === null) {
    return `  band ${view.band}  ${view.bandBound ? "BOUND by a process no row accounts for — `--stage-sweep` identifies it" : "free"}`;
  }
  const sessions = view.liveSessions.length === 0 ? "no live sessions" : `sessions ${view.liveSessions.join(",")}`;
  const dead = view.row.dead === undefined ? "" : ` · DEAD since ${view.row.dead.detectedAt} during \`${view.row.dead.op}\``;
  return (
    `  band ${view.band}  ${shortSha(view.row.sha)}  owner ${view.row.checkout} · pid ${view.row.ownerPid ?? "unknown"} · ` +
    `idle ${describeStageAgePhrase(view.row.lastUsedAt, nowMs)} · ${sessions}${dead}`
  );
}

/** The CAP refusal — every row with its idle age, so the operator can see which lane holds what. */
function stageCapRefusal(rowCount: number, views: readonly StageBandView[], limits: StageLimits, nowMs: number): string {
  return [
    `STAGE REFUSED  ${rowCount} stage(s) are registered and the live cap is ${limits.cap} (ORB_STAGE_CAP) — nothing was measured.`,
    ...views.filter((view) => view.row !== null).map((view) => describeStageBandRow(view, nowMs)),
    `  The idle TTL is ${Math.round(limits.ttlMs / MS_PER_MINUTE)} min (ORB_STAGE_TTL_MIN); past it a stage is torn down by its OWN idle timer, or by the next allocation if that timer died.`,
    "  Tear down one you own (`pnpm snap --stage-down`), reap the stranded ones (`pnpm snap --stage-sweep`), or wait —",
    "  tooling/src/snap/lib/stage-bands.ts.",
  ].join("\n");
}

/** The RANGE refusal — every band is either a live row or a port somebody else holds. */
function stageRangeRefusal(views: readonly StageBandView[], nowMs: number): string {
  return [
    `STAGE REFUSED  all ${views.length} stage bands are taken and none is stranded — nothing was measured.`,
    ...views.map((view) => describeStageBandRow(view, nowMs)),
    "  Tear down one you own (`pnpm snap --stage-down`), reap the stranded ones (`pnpm snap --stage-sweep`), or wait —",
    "  the band range is tooling/src/_shared/ports.ts `STAGE_BANDS`.",
  ].join("\n");
}

// ── the three-probe health verdict + the ERA rule ─────────────────────────────────────────────────────

/** How many `--dirty` rsyncs a stage may absorb before its vite is presumed to have a corrupt module graph
 *  (memory `long-lived-vite-corrupt-graph`: a LONG-LIVED vite that absorbed a multi-merge era served a
 *  boot-dead page whose source proved consistent; a clean restart fixed it with zero code changes). */
export const STAGE_ERA_MAX_RSYNCS = 20;
/** And the wall-clock half of the same rule — this many hours of HMR is an era whatever the rsync count. */
const STAGE_ERA_MAX_HOURS = 6;
const STAGE_ERA_MAX_AGE_MS = STAGE_ERA_MAX_HOURS * MINUTES_PER_HOUR * MS_PER_MINUTE;

/** `healthz ok` ∧ `vite answers` ∧ `served-probe fresh`, then the ERA rule (§3.6).
 *
 *  THE THIRD PROBE IS THE WHOLE POINT: a stage whose watcher died keeps healthz green and its ports bound
 *  while serving a pre-change transform to every page load (#524 — 24 minutes of white screens under
 *  `status=up`). Two probes call that stage `warm`; three call it `degraded`.
 *
 *  `unverifiable` is read by SOURCE KIND, and the asymmetry is deliberate. A `--ref` stage is a frozen
 *  worktree: its files cannot change after boot, so there is nothing for a dead watcher to serve stale and
 *  "no comparable module" is an honest, harmless answer. A `--dirty` stage's tree is rsync'd under a live
 *  watcher on every call — the one shape the probe exists to judge — so an unmeasurable freshness there is
 *  `degraded`, never `warm` (a bare zero is "I couldn't measure", never "it isn't there"). */
export function stageHealthVerdict(evidence: StageHealthEvidence): StageHealth {
  if (!(evidence.healthzOk && evidence.viteOk)) {
    return "degraded";
  }
  if (evidence.served === "stale" || evidence.served === "unreachable") {
    return "degraded";
  }
  if (evidence.served === "unverifiable" && evidence.dirty) {
    return "degraded";
  }
  if (evidence.dirty && (evidence.rsyncs > STAGE_ERA_MAX_RSYNCS || evidence.ageMs > STAGE_ERA_MAX_AGE_MS)) {
    return "rebuild";
  }
  return "warm";
}
