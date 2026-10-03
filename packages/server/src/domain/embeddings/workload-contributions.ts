// domain/embeddings — the domain's OWN background work, raised as `WorkloadContribution`s (the workloads
// junk-drawer exit: domains raise seams, the worker skims them). ONE kind: `index`, the parameterized
// reindex over the vector substrate.
//
// Everything the run needs is a dep of THIS factory, closed over at `entry/compose` — never a shared
// per-dispatch env hub. The projection from the service's richer pass stats down to the wire
// `EmbedPassResult` lives here too (it used to sit at the entry tier, in `compose/runner-env.ts`).

import type { EmbedPassResult } from "@orb/contracts/embeddings";
import type { WorkloadRunContext } from "@orb/contracts/workloads";
import { indexWorkloadParams } from "@orb/contracts/workloads";
import type { WorkloadContribution } from "#domain/workloads";
import type { EmbeddingsWorkloadDeps } from "./contract/service.ts";

/**
 * THE TERMINAL FAN — ONE `corpusRecomputed` per owner in scope, at the END of the sweep, never per embedded
 * row. The same shape (and the same member) as discovery's five analytics passes, deliberately: what a
 * subscriber is told is "the analytics over your corpus moved", and no client read projects a raw vector.
 * See `domain/discovery/workload-contributions.ts` for the full rationale — it lives there because that file
 * is where five of the six passes end; this is the sixth.
 *
 * Called from a `finally`, so an aborted sweep still announces the rows it already embedded.
 */
async function announceCorpus(deps: EmbeddingsWorkloadDeps, ctx: WorkloadRunContext): Promise<void> {
  const owners = ctx.ownerId === null ? await deps.listCorpusOwners() : [ctx.ownerId];
  for (const owner of owners) {
    deps.emitUserEvent(owner, { type: "corpusRecomputed" });
  }
}

/** The progress row's headline: a re-index after an embedder change says why the library is being rebuilt. */
const EMBEDDER_CHANGED_LABEL = "Your library is re-indexing for the new embedder";

function corpusLabel(params: { readonly force?: boolean | undefined; readonly embedderChanged?: boolean | undefined }): string {
  if (params.embedderChanged === true) {
    return EMBEDDER_CHANGED_LABEL;
  }
  return params.force === true ? "re-embedding corpus (force)" : "embedding corpus";
}

/**
 * `index` — the parameterized embeddings reindex: text (corpus + chat-block memory), image (avatars), or
 * all (both, one atomic result). Its ADMISSION KEY is the embed source, so a text reindex and an image
 * reindex run concurrently while two same-source runs don't. `force` re-embeds matched rows; without it the
 * pass is resumable-by-skip.
 */
export function createEmbeddingsWorkloadContributions(deps: EmbeddingsWorkloadDeps): readonly [WorkloadContribution<"index">] {
  return [
    {
      kind: "index",
      // The `source` field is this kind's lock sub-partition, so this schema stays in the workloads
      // contracts module (see its comment there) — the only kind whose params aren't owner-authored.
      params: indexWorkloadParams,
      // The CONCURRENCY UNIT is one embed space: text and image sweep independently, two text sweeps do not.
      admissionKey: (params) => params.source,
      // Only the image lens spends a generative call (one avatar analysis each); text embedding calls none.
      modelCalls: ({ ownerId, params }) =>
        params.source === "text" ? Promise.resolve(0) : deps.embeddings.countAssetAnalysisCalls({ ownerId, force: params.force ?? false }),
      // A GPU embed sweep over the whole corpus: minutes, and never latency-sensitive.
      lane: "sweep",
      // Hash/skip-gated end to end — a retry safely re-runs the whole pass.
      resume: "idempotent-restart",
      run: async (ctx, params, report, signal): Promise<EmbedPassResult> => {
        try {
          const force = params.force ?? false;
          let embedded = 0;
          let skipped = 0;
          if (params.source === "text" || params.source === "all") {
            const label = corpusLabel(params);
            report({ message: label });
            // An embedder switch re-embeds every card, so the corpus pass reports N of M like the avatar pass.
            const result = await deps.embeddings.embedCorpus({
              ownerId: ctx.ownerId,
              force,
              signal,
              onProgress: (done, total) => {
                report({ message: `${label} — ${done} of ${total}`, current: done, total });
              },
            });
            embedded += result.embedded;
            skipped += result.skipped;
          }
          if (params.source === "image" || params.source === "all") {
            const label = force ? "re-embedding assets (force)" : "analysing avatars";
            report({ message: label });
            // N-of-M (issue #166 rider 3): the pass owns the denominator, so it hands each position back and
            // this is the only place that can turn it into a progress row. Without it a 350-image VL sweep
            // showed one sentence and an indeterminate bar for its whole runtime.
            const result = await deps.embeddings.embedAssets({
              ownerId: ctx.ownerId,
              force,
              signal,
              onProgress: (done, total) => {
                report({ message: `${label} — ${done} of ${total}`, current: done, total });
              },
            });
            embedded += result.embedded;
            skipped += result.skipped;
          }
          report({ message: "indexed", current: embedded, total: embedded + skipped });
          return { embedded, skipped };
        } finally {
          await announceCorpus(deps, ctx);
        }
      },
    },
  ];
}
