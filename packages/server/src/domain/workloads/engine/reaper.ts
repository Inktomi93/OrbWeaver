// domain/workloads/engine/reaper — `reapOrphanedWorkloads`: sweep in-flight rows whose lease (heartbeat)
// went stale (a dead worker) to the `worker_died` terminal, FREEING the kind's single-active slot so the
// next `start()` of that kind can proceed. This is what unwedges a kind after a worker crash — the partial
// unique index holds the slot for an orphaned in-flight row until the reaper releases it.
//
// SAFETY: each stamp goes through the status-guarded `markTerminal` (guarded on
// the in-flight states), so a row a returning zombie or a fresh claim already moved is NOT double-reaped —
// `markTerminal` returns `false` and the reaper skips it. The stale threshold defaults to 15s (3× the 5s
// heartbeat cadence) so a brief GC/DB blip can't falsely reap a live worker.
//
// DETERMINISM: `now` + the threshold are passed in (the worker supplies its injected clock + tuning); no
// ambient `Date.now()`.

import type { Db } from "@orb/db";
import type { WorkloadError } from "../contract/workload-error";
import { findStaleInFlight, markTerminal } from "../persistence/queries";
import { emitWorkloadEvent } from "./progress-bus";

// 3× the 5s heartbeat cadence — the lease grace before a silent worker is declared dead.
const DEFAULT_STALE_THRESHOLD_MS = 15_000;
const REAPED_MESSAGE = "worker heartbeat went stale — row reaped (worker_died)";

/**
 * Reap every in-flight row whose `updatedAt` is older than `now - staleThresholdMs`. Returns the count
 * actually reaped (rows another path already terminalized are skipped via the guarded stamp). Emits a
 * `failed` bus event carrying `WorkloadError{ kind: "worker_died" }` for each reaped row (the reaper is the
 * SOLE producer of that error arm — §7.5 one-producer-per-arm).
 */
export async function reapOrphanedWorkloads(args: {
  db: Db;
  now: number;
  staleThresholdMs?: number;
}): Promise<number> {
  const threshold = args.staleThresholdMs ?? DEFAULT_STALE_THRESHOLD_MS;
  const stale = await findStaleInFlight(args.db, args.now - threshold);
  const error: WorkloadError = { kind: "worker_died", message: REAPED_MESSAGE };
  const results = await Promise.all(
    stale.map(async (row) => {
      const moved = await markTerminal(args.db, {
        id: row.id,
        status: "worker_died",
        error: REAPED_MESSAGE,
        now: args.now,
      });
      if (moved) {
        emitWorkloadEvent({
          type: "failed",
          workloadId: row.id,
          kind: row.kind,
          at: args.now,
          error,
        });
      }
      return moved;
    }),
  );
  return results.filter(Boolean).length;
}
