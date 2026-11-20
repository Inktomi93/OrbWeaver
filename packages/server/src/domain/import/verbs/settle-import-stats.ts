// The post-import stats rebuild settles apart from the import's verdict: the import's rows have landed, so a rebuild
// that live chat outran on every attempt is handed to a queued `reconcile-stats` run, which rebuilds once the library
// stops moving under it, and the import still succeeds. Any other rebuild fault is a real fault and still fails the run.

import { StatsRebuildStarvedError } from "@orb/contracts/stats";
import type { UserId } from "@orb/kit/ids";
import type { Logger } from "#foundation/observability";
import { getLog } from "#foundation/observability";
import type { ImportPostprocessDeps } from "../contract/post-import.ts";
import type { SettleImportStats } from "../contract/workloads.ts";

/** The settle every import door runs after its writes. `rebuild` is the stats domain's owner rebuild; a deferred
 *  rebuild adopts a `reconcile-stats` run the owner already has queued, as the post-import index pass does. */
export function createSettleImportStats(deps: {
  readonly rebuild: (args: { readonly ownerId: UserId }) => Promise<void>;
  readonly workloads: Pick<ImportPostprocessDeps, "start">;
  readonly logger: Logger;
}): SettleImportStats {
  return async ({ ownerId }) => {
    try {
      await deps.rebuild({ ownerId });
      return "rebuilt";
    } catch (err) {
      if (!(err instanceof StatsRebuildStarvedError)) {
        throw err;
      }
    }
    getLog(deps.logger).warn({ ownerId }, "import: live writes outran the post-import stats rebuild; a queued reconcile-stats run owns it");
    await deps.workloads.start({
      input: { kind: "reconcile-stats", params: {} },
      caller: null,
      funderUserId: null,
      mode: "singular",
      ownerId,
      adoptActive: true,
    });
    return "deferred";
  };
}
