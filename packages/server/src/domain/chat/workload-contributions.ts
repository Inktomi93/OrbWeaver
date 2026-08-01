// domain/chat — the domain's OWN background work, raised as `WorkloadContribution`s (the workloads
// junk-drawer exit: domains raise seams, the worker skims them). Two kinds, both corpus sweeps over chat's
// canon: `memory-backfill` (the memory subsystem's segment/digest rebuild) and `group-character-backfill`
// (PD-41/D38 — mint the synthetic group character for every multi-character room that lacks one).
//
// The ops are the SAME chat-ctx-bound sweeps compose already built; only their home changed. The one
// cross-domain reach — the PD-139(b) old-embed-space reclaim — is an INJECTED op at chat's door
// (`purgeMemoryVectors`), which is exactly what the retired hub existed to avoid building.

import type { BackfillPassResult, MemoryBackfillResult } from "@orb/contracts/chat";
import { emptyWorkloadParams } from "@orb/contracts/workloads";
import type { WorkloadContribution } from "#domain/workloads";
import type { ChatWorkloadDeps } from "./contract/workloads";

type ChatContributions = readonly [WorkloadContribution<"memory-backfill">, WorkloadContribution<"group-character-backfill">];

export function createChatWorkloadContributions(deps: ChatWorkloadDeps): ChatContributions {
  return [
    {
      kind: "memory-backfill",
      params: emptyWorkloadParams,
      // Segment + digest LLM builds per chat × scope bucket — long by construction.
      lane: "sweep",
      // Hash-diff self-healing end to end; the signal aborts cooperatively between chats.
      resume: "idempotent-restart",
      run: async (ctx, _params, report, signal): Promise<MemoryBackfillResult> => {
        report({ message: "memory backfill: sweeping chats (segments + digests per scope)" });
        const counts = await deps.backfillMemory({ ownerId: ctx.ownerId, signal });
        report({
          message: `memory backfill: ${counts.segments.scanned} chats (${counts.segments.changed} segments), ${counts.digests.scanned} scope buckets (${counts.digests.changed} digests)${counts.failed > 0 ? `, ${counts.failed} chats FAILED (skipped — see error log)` : ""}`,
        });
        // PD-139(b): once a COMPLETE BULK sweep has re-derived every segment/digest into the box's active
        // embed `(model)` space, reclaim the rows stranded in any OTHER space. BULK-ONLY: a model change is a
        // box-level event, so a singular per-owner catch-up must not delete the global old space. Skipped on
        // abort — the space stays a strict superset (never a gap); the rerun reclaims it. (`enumerationScope`
        // is the WORKLOAD ROW's scope, not a chat owner — chats stay membership-scoped, D18.)
        const enumerationScope = ctx.ownerId;
        if (enumerationScope === null && !signal.aborted) {
          await deps.purgeMemoryVectors();
        }
        return counts;
      },
    },
    {
      kind: "group-character-backfill",
      params: emptyWorkloadParams,
      // A fast idempotent sweep (find-first short-circuit per room); owner = the room HOST (D19).
      lane: "sweep",
      resume: "idempotent-restart",
      run: async (ctx, _params, report, signal): Promise<BackfillPassResult> => {
        report({ message: "group-character backfill: sweeping group rooms" });
        const counts = await deps.backfillGroupCharacters({ ownerId: ctx.ownerId, signal });
        report({ message: `group-character backfill: ${counts.scanned} group rooms scanned, ${counts.changed} minted` });
        return counts;
      },
    },
  ];
}
