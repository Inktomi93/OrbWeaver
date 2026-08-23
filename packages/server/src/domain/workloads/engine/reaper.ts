// domain/workloads/engine/reaper — reapOrphanedWorkloads: sweeps in-flight rows whose lease is older than the
// caller's grace window to the worker_died terminal, freeing the kind's single-active slot. Each stamp goes
// through the status-guarded markTerminal, so a returning zombie or already-moved row is not double-reaped.
// now + the threshold are passed in — no ambient Date.now().
//
// THE MESSAGE IS THE FORENSIC RECORD (#560). The row keeps only `status = worker_died` plus this string:
// `markTerminal` overwrites `updatedAt`, the lease column, with the reap instant. So the message carries both
// the caller's `reason` and the lease age OBSERVED before that overwrite. A single shared sentence (what
// shipped before) makes a respawn kill and a genuine grace-window expiry indistinguishable on the row forever
// — which is exactly what a forensics lane had to work around for the 08-22 long-pass deaths. The sentences
// themselves live in `reap-record.ts`, shared with the boot reclaim (the OTHER writer of `worker_died`), so
// the two paths cannot drift into one wording; this sweep declares `heartbeat_stale`.

import type { WorkloadError } from "@orb/contracts/workloads";
import type { ReapWorkloadsArgs } from "../contract/service.ts";
import { findStaleInFlight, markTerminal } from "../persistence/queries.ts";
import { emitWorkloadEvent } from "./progress-bus.ts";
import { reapedMessage } from "./reap-record.ts";

const DEFAULT_STALE_THRESHOLD_MS = 15_000;

export async function reapOrphanedWorkloads(args: ReapWorkloadsArgs): Promise<number> {
  const threshold = args.staleThresholdMs ?? DEFAULT_STALE_THRESHOLD_MS;
  const stale = await findStaleInFlight(args.db, args.contributions, args.now - threshold);
  const results = await Promise.all(
    stale.map(async (row) => {
      const message = reapedMessage(args.reason, args.now - row.updatedAt);
      const moved = await markTerminal(args.db, {
        id: row.id,
        status: "worker_died",
        error: message,
        now: args.now,
      });
      if (moved) {
        const error: WorkloadError = { kind: "worker_died", message };
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
