// domain/workloads/engine/next-runnable — the queue scan's lifecycle bridge. Persistence returns durable
// terminalizations as data; the engine publishes each canonical failure event only after the guarded write
// settled. This preserves the persistence no-bus ruling while making every scheduler terminal visible.

import type { NextRunnableWorkload, NextRunnableWorkloadDeps } from "../contract/service.ts";
import { scanRunnableWorkloads } from "../persistence/queries.ts";

/** Return the first runnable row in a lane and publish every durable failure encountered while scanning. */
export function createNextRunnableWorkload(deps: NextRunnableWorkloadDeps): NextRunnableWorkload {
  return async (now, lane) =>
    await scanRunnableWorkloads({
      db: deps.db,
      contributions: deps.contributions,
      now,
      lane,
      onFailure: (failure): void => {
        deps.emitEvent({ type: "failed", workloadId: failure.workloadId, kind: failure.kind, at: now, error: failure.error });
      },
    });
}
