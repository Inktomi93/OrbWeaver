// THE BAND CENSUS — what the box says about every band right now, and the LOCKED acquire that turns that
// census into "this band is mine" (issue #1276). The pure
// rules are lib/stage-bands.ts; the table I/O is ops/stage-marker.ts; the raw signals are
// ops/stage-probe.ts. This module is the seam that reads all three, and it is the ONE place a band is
// claimed — ops/stage.ts boots what it hands back and ops/stage-status.ts prints it.
//
// ONE `ss`, ONE session read, PER CENSUS. Ten bands × two ports asked separately was twenty forks; a census
// that re-forks per band can also disagree with itself halfway through (a band that was free in question 3
// and bound in question 11). `listeningPids()` answers once and every verdict is read off that snapshot.
//
// HEALTH IS PROBED LAZILY, AND THAT IS A CORRECTNESS PROPERTY, NOT A SHORTCUT. `bandAccess` reads `healthy`
// in exactly one branch — the `shared-reuse` decision about a FOREIGN row at OUR sha — so the census probes
// exactly those rows. Probing all ten would put ten curl pairs (and, for dirty stages, ten node children)
// in the critical section of a lock every sibling lane is waiting on.
import { print } from "../../floor/artifacts/artifacts.ts";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import { readConcurrencyProfile } from "../../floor/host/concurrency-profile.ts";
import type { PortOwner } from "../../floor/host/platform.ts";
import { listeningPids, socketTableOrThrow } from "../../floor/host/platform.ts";
import { STAGE_BANDS, stageBandPorts } from "../../floor/host/ports.ts";
import { processEnvValue } from "../../floor/process/process-env.ts";
import type { StageBandAcquireInput, StageBandAcquisition, StageBandView, StageHealth, StageLimits, StageRow } from "../contract/stage.ts";
import { allocateStageBand, isSharedReuseCandidate, liveHoldersOf, resolveStageLimits, stageHealthVerdict } from "../lib/stage-bands.ts";
import { DIRTY_STAGE_KEY } from "../lib/stage-plan.ts";
import { liveSessionNames } from "./session-registry.ts";
import { currentHolder } from "./stage-holders.ts";
import { readBands, withBandsLock, writeRow } from "./stage-marker.ts";
import { bandIsBound, holderProcessRunning, pidIsStageRooted, stageHealthzOk, stageServedState, stageViteOk } from "./stage-probe.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

/** THE env door for the band table's calibration knobs — read once, at module load, because every consumer
 *  is a FRESH PROCESS (the snap cli, the daemon cli, each spawned proof), so a caller that wants different
 *  knobs sets them in the environment of the CHILD and never mid-process. Same posture as the session
 *  registry's `ORB_SESSION_TTL_MIN`/`ORB_SESSION_CAP` door. */
const TTL_MIN_ENV = processEnvValue("ORB_STAGE_TTL_MIN");
const CAP_ENV = processEnvValue("ORB_STAGE_CAP");

/** The owner-ruled limits (F5), with any env-parse refusal PRINTED rather than silently defaulted — a TTL
 *  that quietly became 60 min is the strand class the table exists to end. */
export function stageLimits(): StageLimits {
  // The cap's BASE is the box profile's (#1848 — tooling/concurrency-profile.json is the one home for
  // every cap since #1835, and this one was missed by it); `ORB_STAGE_CAP` still overrides.
  const { limits, errors } = resolveStageLimits({ ttlMinEnv: TTL_MIN_ENV, capEnv: CAP_ENV, capBase: readConcurrencyProfile().stageCap });
  for (const error of errors) {
    print(`[snap-stage] ${error} — using the default`);
  }
  return limits;
}

/** The THREE probes of §3.6, wired: `healthz ok` ∧ `vite answers` ∧ `served-probe fresh`, then the ERA rule.
 *
 *  The third probe is asked ONLY of the stage whose source can change. A `--ref` stage is a frozen detached
 *  worktree — nothing rsyncs into it and its own watchers never fire (that immunity is the whole reason
 *  `--isolated` exists), so a dead watcher there has nothing stale to serve and the probe could only ever
 *  answer `fresh`/`unverifiable` at the cost of a node child on every snap call. §3.6 grants a `--ref` stage
 *  exactly this exemption for the ERA half of the rule; the same "never HMRs" fact is what makes it sound
 *  here. A `--dirty` stage is rsync'd under a LIVE watcher on every call, so it is always asked. */
export function stageRowHealth(row: StageRow, nowMs: number): StageHealth {
  if (row.dead !== undefined) {
    return "degraded";
  }
  const dirty = row.sha === DIRTY_STAGE_KEY;
  const healthzOk = stageHealthzOk(row.serverPort);
  const viteOk = healthzOk && stageViteOk(row.vitePort);
  const served = dirty && viteOk ? stageServedState(row.dir, row.vitePort) : "unverifiable";
  return stageHealthVerdict({
    healthzOk,
    viteOk,
    served,
    dirty,
    rsyncs: row.rsyncs,
    ageMs: Math.max(0, nowMs - Date.parse(row.startedAt)),
  });
}

/** Both halves of a session's registered band must still be listening. One missing half is a dead stage,
 *  not a degraded-but-usable base; the session records the transition and refuses later calls. */
export function stageBindingAlive(home: string, band: number, bound: ReadonlyMap<number, PortOwner>): boolean {
  const row = readBands(home).find((candidate) => candidate.band === band);
  return row !== undefined && bound.has(row.serverPort) && bound.has(row.vitePort);
}

/** The census: one view per band in the registry, rows matched in, ports read off ONE `ss` snapshot, live
 *  session names read off the session registry, and `healthy` probed only where `bandAccess` will read it. */
export function stageBandViews(input: {
  readonly rows: readonly StageRow[];
  readonly root: string;
  readonly checkout: string;
  readonly targetSha: string | null;
  readonly nowMs: number;
}): readonly StageBandView[] {
  // An unreadable table throws (a tool error): every band would read unbound, and an unbound band with a
  // foreign row is a corpse to reclaim, so allocation would boot onto a live sibling's ports.
  const bound = socketTableOrThrow(listeningPids());
  const live = liveSessionNames(input.root);
  return STAGE_BANDS.map((band) => {
    const row = input.rows.find((candidate) => candidate.band === band) ?? null;
    const ports = stageBandPorts(band);
    const bandBound = bandIsBound(ports, bound);
    const owners = [bound.get(ports.server), bound.get(ports.vite)].filter((owner): owner is PortOwner => owner !== undefined);
    return {
      band,
      row,
      bandBound,
      // EVERY bound port must be a stage's; one unidentified holder is enough to keep our hands off the
      // band entirely, because killing its group could take an unrelated server with it (#324's fence). An
      // owner the OS will not name is such a holder.
      bandIsStageRooted: owners.length > 0 && owners.every((owner) => owner.kind === "pid" && pidIsStageRooted(owner.pid)),
      healthy: isSharedReuseCandidate(row, { owner: input.checkout, targetSha: input.targetSha, bandBound }) && stageRowHealth(row, input.nowMs) === "warm",
      liveSessions: row === null ? [] : row.sessions.filter((name) => live.has(name)),
      liveHolders: row === null ? [] : liveHoldersOf(row, input.nowMs, holderProcessRunning),
    };
  });
}

/** The PROVISIONAL row written inside the allocation lock, before the 55 s boot: it claims the band by
 *  name so a sibling entering the lock a millisecond later sees it occupied and takes the next one. The
 *  boot rewrites it with the real pid and the db provenance; a boot that throws clears it. */
export function claimRow(claim: {
  readonly band: number;
  readonly checkout: string;
  readonly owner: string;
  readonly targetSha: string;
  readonly dir: string;
  readonly nowIso: string;
}): StageRow {
  const { band, targetSha, dir, nowIso } = claim;
  const ports = stageBandPorts(band);
  return {
    band,
    sha: targetSha,
    dir,
    serverPort: ports.server,
    vitePort: ports.vite,
    checkout: claim.checkout,
    owner: claim.owner,
    ownerPid: null,
    startedAt: nowIso,
    lastUsedAt: nowIso,
    holders: [currentHolder(claim.owner)],
    sessions: [],
    dbProvenance: null,
    rsyncs: 0,
  };
}

/** Read the table, judge every band, decide, and — for the two arms that take a band we do not already
 *  hold — CLAIM it by writing the row, all inside the table's mutex. The claim is what makes concurrent
 *  allocation safe: a sibling entering the lock a millisecond later sees an occupied row and moves to the
 *  next band, instead of booting a second stack onto the same ports 55 seconds from now.
 *
 *  `claim` is the caller's row-builder for the band it was given (the boot has not happened yet, so the row
 *  it writes is provisional — ops/stage.ts rewrites it with the real pid once the stack is up, and clears
 *  it if the boot throws). */
export function acquireStageBand(input: StageBandAcquireInput): StageBandAcquisition {
  return withBandsLock(input.home, () => {
    const rows = readBands(input.home);
    const views = stageBandViews({ rows, root: input.root, checkout: input.checkout, targetSha: input.targetSha, nowMs: input.nowMs });
    const allocation = allocateStageBand({
      views,
      checkout: input.checkout,
      targetSha: input.targetSha,
      dirty: input.dirty,
      fresh: input.fresh,
      limits: stageLimits(),
      nowMs: input.nowMs,
      auth: input.auth,
    });
    if (allocation.kind === "free" || allocation.kind === "reap") {
      // Written INSIDE the lock, replacing the stranded row for a `reap` — the band is ours from here, and
      // the teardown of whatever was on it happens outside the critical section.
      // `writeRow` is read-modify-write, because the table is one file and a blind overwrite would drop a
      // sibling's row on another band.
      writeRow(input.home, input.claim(allocation.band));
    }
    return { allocation, views };
  });
}
