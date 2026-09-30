// A run's hold on the stage it reads: a holder entry on the band row, re-stamped on a heartbeat and keyed to
// the stage identity it bound, so it never outlives that stage or stamps the next one on the band.
import process from "node:process";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { warn } from "../../_shared/log.ts";
import type { StageHolder, StageRow } from "../contract/stage.ts";
import { readBands, withBandsLock, writeRow } from "./stage-marker.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

/** The stage a holder bound: a rebuild or a new stage on the same band is a different identity, and a
 *  holder never stamps a row that is not the one it bound. */
function sameStage(row: StageRow, bound: Pick<StageRow, "sha" | "dir" | "startedAt">): boolean {
  return row.sha === bound.sha && row.dir === bound.dir && row.startedAt === bound.startedAt;
}

/** One heartbeat of a holder: under the table lock, replace this process's holder entry and stamp the use.
 *  Returns false when the band no longer carries the stage this holder bound. */
function stampHolder(home: string, bound: StageRow, holder: StageHolder, release: boolean): boolean {
  return withBandsLock(home, () => {
    const row = readBands(home).find((candidate) => candidate.band === bound.band) ?? null;
    if (row === null || !sameStage(row, bound)) {
      return false;
    }
    const others = (row.holders ?? []).filter((entry) => entry.pid !== holder.pid);
    writeRow(home, { ...row, lastUsedAt: holder.stampedAt, holders: release ? others : [...others, holder] });
    return true;
  });
}

/** Hold a stage for as long as this process reads it: stamp this process as a holder now and every
 *  `intervalMs` after, so its use never reads older than one interval to another checkout deciding whether
 *  it may tear the stage down. The holder stops by itself once the band carries a different stage. The
 *  timer is unref'd, so it never keeps a finished run alive, and a heartbeat that cannot take the table
 *  lock is logged and retried at the next interval rather than failing the run. Returns the release. */
export function holdStageUse(home: string, bound: StageRow, checkout: string, intervalMs: number): () => void {
  const beat = (release: boolean): boolean => {
    // @orb-waive caught-failure-ownership(error): a heartbeat is advisory; the failure is logged and the next interval retries, and the run it guards must never fail on it. Ends if a missed heartbeat must fail the run.
    try {
      return stampHolder(home, bound, { pid: process.pid, checkout, stampedAt: new Date().toISOString() }, release);
    } catch (error) {
      warn(`[snap-stage] band ${String(bound.band)} use heartbeat skipped: ${error instanceof Error ? error.message : String(error)}`);
      return true;
    }
  };
  let timer: NodeJS.Timeout | null = null;
  const stop = (): void => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
  if (beat(false)) {
    timer = setInterval(() => {
      if (!beat(false)) {
        stop();
      }
    }, intervalMs);
    timer.unref();
  }
  return () => {
    stop();
    beat(true);
  };
}
