// verb: embedCorpus — the PD-53 bulk TEXT catch-up sweep (the resumable `content_hash`-gated re-index pass
// the `embed-corpus` workload drives). Enumerates every non-synthetic character (the injected un-principal
// `listCharacterIds` — D20), re-reads each card's embed text (`loadCardText`, canon not cache), and routes it
// through the ONE write path (the `store` verb, injected at `service.ts` per the domain-no-cross-verb gate —
// this verb adds no second write site).
//
// Resumability is the hash gate itself: `store` short-circuits a matched `content_hash` to a `noop`, so an
// aborted/failed run's rerun skips everything already embedded and picks up the remainder. `force` threads
// through to `store` (bypass the short-circuit — the deliberate full re-index). Cooperative abort BETWEEN
// items (the `backfillMemory` precedent — every completed item is durable + idempotent). An embed failure
// PROPAGATES (the workload records the failed run; never a swallowed error — the rerun resumes).
//
// Counts: `embedded` = cards that landed a fresh vector this run; `skipped` = hash-gate noops + cards whose
// text vanished/emptied between the enumeration and the read (deleted mid-sweep, or an empty projection —
// mirroring the compose-root single-card embed port's empty-text skip).

import type { EmbedPassParams } from "../contract/params";
import type { BulkEmbedResult } from "../contract/results";
import type { EmbeddingsContext, EmbeddingsService } from "../contract/service";

export function createEmbedCorpus(
  ctx: EmbeddingsContext,
  deps: { readonly store: EmbeddingsService["store"] },
): EmbeddingsService["embedCorpus"] {
  return async ({ force, signal }: EmbedPassParams): Promise<BulkEmbedResult> => {
    let embedded = 0;
    let skipped = 0;
    for (const characterId of await ctx.listCharacterIds()) {
      if (signal.aborted) {
        break; // cooperative abort between items — every completed embed is durable + idempotent
      }
      // biome-ignore lint/performance/noAwaitInLoops: the sweep is sequential BY DESIGN (the backfillMemory precedent — parallel items would stampede the embed backend; the hash gate makes per-item cost cheap on resume).
      const text = await ctx.loadCardText(characterId);
      if (text === undefined || text.length === 0) {
        skipped += 1;
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: sequential by design (see the read above).
      const result = await deps.store({
        kind: "card",
        lens: "card-text",
        characterId,
        content: text,
        model: ctx.roleClients.embedModel,
        dim: ctx.embedDim,
        force,
      });
      if (result.outcome === "written") {
        embedded += 1;
      } else {
        skipped += 1;
      }
    }
    return { embedded, skipped };
  };
}
