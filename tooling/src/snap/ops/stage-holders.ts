// A run's hold on the stage it reads: a holder entry on the band row, re-stamped on a heartbeat and keyed to
// the stage identity it bound, so it never outlives that stage or stamps the next one on the band.
import process from "node:process";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { warn } from "../../_shared/log.ts";
import { processStartTicks } from "../../_shared/platform.ts";
import type { StageHolder, StageRow } from "../contract/stage.ts";
import { readBands, withBandsLock, writeRow } from "./stage-marker.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

/** Attempts at the first beat, each bounded by the table lock's own wait. The bind fails after these. */
const FIRST_BEAT_ATTEMPTS = 2;
/** A later beat never waits for the lock: a busy table skips one beat, and the run is never paused. */
const LATER_BEAT_LOCK_WAIT_MS = 0;
/** The release at exit waits briefly; an entry it misses is pruned once its pid is gone. */
const RELEASE_LOCK_WAIT_MS = 1000;

/** The stage a holder bound: a rebuild or a new stage on the same band is a different identity, and a
 *  holder never stamps a row that is not the one it bound. */
function sameStage(row: StageRow, bound: Pick<StageRow, "sha" | "dir" | "startedAt">): boolean {
  return row.sha === bound.sha && row.dir === bound.dir && row.startedAt === bound.startedAt;
}

/** One heartbeat of a holder: under the table lock, replace this process's holder entry and stamp the use.
 *  Returns false when the band no longer carries the stage this holder bound. */
function stampHolder(home: string, bound: StageRow, beat: { readonly holder: StageHolder; readonly release: boolean; readonly lockWaitMs?: number }): boolean {
  return withBandsLock(
    home,
    () => {
      const row = readBands(home).find((candidate) => candidate.band === bound.band) ?? null;
      if (row === null || !sameStage(row, bound)) {
        return false;
      }
      const others = (row.holders ?? []).filter((entry) => entry.pid !== beat.holder.pid);
      writeRow(home, { ...row, lastUsedAt: beat.holder.stampedAt, holders: beat.release ? others : [...others, beat.holder] });
      return true;
    },
    beat.lockWaitMs,
  );
}

/** Hold a stage for as long as this process reads it. The first beat is written before this returns, with a
 *  bounded retry, and a first beat that cannot be written throws: a run must not proceed unprotected. Later
 *  beats run every `intervalMs` on an unref'd timer and never wait for the lock. The hold stops by itself
 *  once the band carries a different stage, and is released when the process exits. Returns the release. */
export function holdStageUse(home: string, bound: StageRow, checkout: string, intervalMs: number): () => void {
  const pidStart = processStartTicks(process.pid);
  const holder = (): StageHolder => ({ pid: process.pid, ...(pidStart === null ? {} : { pidStart }), checkout, stampedAt: new Date().toISOString() });
  let held = false;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < FIRST_BEAT_ATTEMPTS && !held; attempt += 1) {
    // @orb-waive caught-failure-ownership(error): retried, and after the last attempt rethrown as the bind's own failure below. Ends if the first beat stops being retried.
    try {
      held = stampHolder(home, bound, { holder: holder(), release: false });
      if (!held) {
        warn(`[snap-stage] band ${String(bound.band)} no longer carries the stage this run bound; nothing to hold`);
        return () => undefined;
      }
    } catch (error) {
      lastError = error;
    }
  }
  if (!held) {
    throw new Error(
      `could not register this run's hold on stage band ${String(bound.band)}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
  }
  const beat = (releasing: boolean, lockWaitMs: number): boolean => {
    // @orb-waive caught-failure-ownership(error): a later heartbeat is advisory; the failure is logged and the next interval retries, and the run it guards must never fail on it. Ends if a missed heartbeat must fail the run.
    try {
      return stampHolder(home, bound, { holder: holder(), release: releasing, lockWaitMs });
    } catch (error) {
      warn(`[snap-stage] band ${String(bound.band)} use heartbeat skipped: ${error instanceof Error ? error.message : String(error)}`);
      return true;
    }
  };
  const timer = setInterval(() => {
    if (!beat(false, LATER_BEAT_LOCK_WAIT_MS)) {
      clearInterval(timer);
    }
  }, intervalMs);
  timer.unref();
  const release = (): void => {
    clearInterval(timer);
    process.off("exit", release);
    beat(true, RELEASE_LOCK_WAIT_MS);
  };
  process.once("exit", release);
  return release;
}
