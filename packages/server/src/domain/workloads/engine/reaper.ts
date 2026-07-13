// domain/workloads/engine/reaper — reapOrphanedWorkloads: sweeps in-flight rows whose heartbeat went stale
// (a dead worker) to the worker_died terminal, freeing the kind's single-active slot. Each stamp goes
// through the status-guarded markTerminal, so a returning zombie or already-moved row is not double-reaped.
// now + the threshold are passed in — no ambient Date.now().

import type { Db } from "@orb/db";
import type { WorkloadError } from "../contract/workload-error";
import { findStaleInFlight, markTerminal } from "../persistence/queries";
import { emitWorkloadEvent } from "./progress-bus";

const DEFAULT_STALE_THRESHOLD_MS = 15_000;
const REAPED_MESSAGE = "worker heartbeat went stale — row reaped (worker_died)";

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
