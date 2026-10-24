// Generation changes rebuild every vector scope under the same owner and supervision contract.
// Live indexing gates only ordinary catch-up; a moved or stale target must rebuild even when it is off.

import type { UserId } from "@orb/kit/ids";
import type { SpanAttrs } from "#foundation/observability";
import { createDetachedSupervision } from "#foundation/observability";
import type { EmbeddingReindexDeps, EmbeddingReindexTriggers } from "../contract/reindex.ts";

const EMBED_REINDEX_SPAN = "embeddings.modelChangeReindex";

interface EmbedSweep {
  readonly requestId: string;
  readonly attrs: SpanAttrs;
  readonly start: () => Promise<unknown>;
}

/** Build the generation-change and live-autoindex triggers over injected workload admission. */
export function createEmbeddingReindexTriggers(deps: EmbeddingReindexDeps): EmbeddingReindexTriggers {
  const { superviseDetached, superviseSettled } = createDetachedSupervision(deps.logger);
  const supervise = deps.supervise ?? superviseDetached;
  // Memory-off owners record a vacuous receipt instead of queueing a run admission would refuse.
  const enqueueOwnerMemory = async (ownerId: UserId, params: { readonly embedderChanged?: boolean }): Promise<unknown> => {
    const vacuous = await deps.vacuousMemoryReceipt(ownerId);
    if (vacuous === null) {
      return await deps.startWorkload({
        input: { kind: "memory-backfill", params },
        caller: null,
        funderUserId: ownerId,
        mode: "singular",
        ownerId,
        adoptActive: true,
      });
    }
    return await deps.purgeMemoryVectors({
      ownerId,
      generation: { id: vacuous.generationId, task: "embed", via: "embed", epoch: vacuous.generationEpoch, space: vacuous.model },
      ...(vacuous.onlyIf === null ? {} : { emptyScope: vacuous.onlyIf }),
    });
  };

  // Forced rebuilds bypass autoindex and adopt existing runs; each scope completes under its own root span.
  const embedSweeps = (scope: UserId | null, embedderChanged = scope === null): readonly EmbedSweep[] => {
    if (!embedderChanged && deps.getEffectiveConfig().corpusAutoindex !== true) {
      return [];
    }
    const at = String(deps.now());
    const mode = scope === null ? "bulk" : "singular";
    // A rebuild's databank and memory runs carry the flag too, so each holds its own slot beside a plain run.
    const rebuild = embedderChanged ? { embedderChanged } : {};
    const sweep = (workloadKind: string, start: () => Promise<unknown>): EmbedSweep => ({
      requestId: `embed-reindex:${workloadKind}:${scope ?? "all"}:${at}`,
      attrs: { workloadKind },
      start,
    });
    return [
      sweep("index", () =>
        deps.startWorkload({
          input: { kind: "index", params: embedderChanged ? { source: "all", force: true, embedderChanged } : { source: "all" } },
          caller: null,
          funderUserId: null,
          mode,
          ownerId: scope,
          adoptActive: true,
        }),
      ),
      sweep("databank-reindex", () =>
        deps.startWorkload({
          input: { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed", ...rebuild } },
          caller: null,
          funderUserId: null,
          mode,
          ownerId: scope,
          adoptActive: true,
        }),
      ),
      sweep("memory-backfill", () =>
        scope === null
          ? deps.startWorkload({
              input: { kind: "memory-backfill", params: { ...rebuild, segmentsOnly: true } },
              caller: null,
              funderUserId: null,
              mode,
              ownerId: null,
              adoptActive: true,
            })
          : enqueueOwnerMemory(scope, rebuild),
      ),
    ];
  };

  const enqueueEmbedReindex = async (scope: UserId | null): Promise<void> => {
    await Promise.all(embedSweeps(scope).map((s) => superviseSettled(s.requestId, EMBED_REINDEX_SPAN, s.attrs, s.start)));
  };
  const detachEmbedReindex = (scope: UserId | null): void => {
    for (const s of embedSweeps(scope)) {
      supervise(s.requestId, EMBED_REINDEX_SPAN, s.attrs, s.start);
    }
  };
  // Target moves force only this owner's rebuild; no other owner's index or jobs are touched.
  const detachRepointReindex = (ownerId: UserId): void => {
    for (const s of embedSweeps(ownerId, true)) {
      supervise(s.requestId, EMBED_REINDEX_SPAN, s.attrs, s.start);
    }
  };

  const detachStaleSpaceReindex = (): void => {
    supervise("embeddings.staleGeneration.reindex", EMBED_REINDEX_SPAN, { workloadKind: "index" }, async () => {
      for (const ownerId of await deps.staleGenerationOwners()) {
        await Promise.all(embedSweeps(ownerId, true).map((s) => superviseSettled(s.requestId, EMBED_REINDEX_SPAN, s.attrs, s.start)));
      }
    });
  };

  let autoindexEnabled = deps.getEffectiveConfig().corpusAutoindex === true;
  const refreshAutoindex = (): void => {
    const enabled = deps.getEffectiveConfig().corpusAutoindex === true;
    const starts = enabled && !autoindexEnabled;
    autoindexEnabled = enabled;
    if (starts) {
      supervise("embeddings.autoindex.catchup", EMBED_REINDEX_SPAN, { workloadKind: "index" }, () =>
        deps.startWorkload({ input: { kind: "index", params: { source: "all" } }, caller: null, funderUserId: null, mode: "bulk", ownerId: null }),
      );
    }
  };
  return { enqueueEmbedReindex, detachEmbedReindex, detachRepointReindex, detachStaleSpaceReindex, refreshAutoindex };
}
