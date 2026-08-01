// domain/embeddings — the domain's OWN background work, raised as `WorkloadContribution`s (the workloads
// junk-drawer exit: domains raise seams, the worker skims them). ONE kind: `index`, the parameterized
// reindex over the vector substrate.
//
// Everything the run needs is a dep of THIS factory, closed over at `entry/compose` — never a shared
// per-dispatch env hub. The projection from the service's richer pass stats down to the wire
// `EmbedPassResult` lives here too (it used to sit at the entry tier, in `compose/runner-env.ts`).

import type { EmbedPassResult } from "@orb/contracts/embeddings";
import { indexWorkloadParams } from "@orb/contracts/workloads";
import type { WorkloadContribution } from "#domain/workloads";
import type { EmbeddingsWorkloadDeps } from "./contract/service";

/**
 * `index` — the parameterized embeddings reindex: text (corpus + chat-block memory), image (avatars), or
 * all (both, one atomic result). The single-active lock keys on (kind, source, owner), so a text reindex
 * and an image reindex run concurrently while two same-source runs don't. `force` re-embeds matched rows;
 * without it the pass is resumable-by-skip.
 */
export function createEmbeddingsWorkloadContributions(deps: EmbeddingsWorkloadDeps): readonly [WorkloadContribution<"index">] {
  return [
    {
      kind: "index",
      // The `source` field is the queue's own lock sub-partition, so this schema stays in the workloads
      // contracts module (see its comment there) — the only kind whose params aren't owner-authored.
      params: indexWorkloadParams,
      // A GPU embed sweep over the whole corpus: minutes, and never latency-sensitive.
      lane: "sweep",
      // Hash/skip-gated end to end — a retry safely re-runs the whole pass.
      resume: "idempotent-restart",
      run: async (ctx, params, report, signal): Promise<EmbedPassResult> => {
        const force = params.force ?? false;
        let embedded = 0;
        let skipped = 0;
        if (params.source === "text" || params.source === "all") {
          report({ message: force ? "re-embedding corpus (force)" : "embedding corpus" });
          const result = await deps.embeddings.embedCorpus({ ownerId: ctx.ownerId, force, signal });
          embedded += result.embedded;
          skipped += result.skipped;
        }
        if (params.source === "image" || params.source === "all") {
          report({ message: force ? "re-embedding assets (force)" : "embedding assets" });
          const result = await deps.embeddings.embedAssets({ ownerId: ctx.ownerId, force, signal });
          embedded += result.embedded;
          skipped += result.skipped;
        }
        report({ message: "indexed", current: embedded, total: embedded + skipped });
        return { embedded, skipped };
      },
    },
  ];
}
