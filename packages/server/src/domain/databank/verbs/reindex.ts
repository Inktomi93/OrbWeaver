// verb: reindex — enqueue a `databank-reindex` workload (the panel/user action for a chunk-param, embed-model,
// or extractor change). Owner-gated: a `document` scope verifies the target is the caller's before enqueue
// (no reindexing a foreign document); an `owner` scope is the caller's own bank. The heavy re-chunk/re-embed
// runs asynchronously in the runner (build-never-blocks); the verb returns the workload id immediately.

import type { WorkloadId } from "@orb/kit/ids";
import { DocumentNotFoundError } from "../contract/errors.ts";
import type { ReindexParams } from "../contract/params.ts";
import type { DatabankContext, DatabankService } from "../contract/service.ts";
import { loadOwnedMeta } from "../persistence/queries.ts";

const DEFAULT_MODE = "chunk-embed" as const;

export function createReindex(ctx: DatabankContext): DatabankService["reindex"] {
  return async ({ principal, scope, mode }: ReindexParams): Promise<{ readonly workloadId: WorkloadId }> => {
    const ownerId = principal.userId;
    if (scope.kind === "document") {
      const owned = await loadOwnedMeta(ctx.db, ownerId, scope.documentId);
      if (owned === undefined) {
        throw new DocumentNotFoundError(scope.documentId);
      }
    }
    return ctx.enqueueReindex({ ownerId, scope, mode: mode ?? DEFAULT_MODE });
  };
}
