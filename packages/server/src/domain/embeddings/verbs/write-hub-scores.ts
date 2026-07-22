// verb: writeHubScores — the `discovery` → embeddings hub-score write seam (the ONLY non-`store` UPDATE —
// the document_chunks reclaim DELETEs prune/purge are the other non-`store` writes — and
// the ONLY path that touches `hub_score`; §invariant 3). It takes the PRE-COMPUTED scores as data and does a
// batch UPDATE keyed `(id, model)` — NO CSLS math here (discovery computes, embeddings stores, search reads).
// Handles a batch of ANY size (a bulk UPDATE, not a matrix op — the dense-vs-streaming threshold is entirely
// discovery's concern). The `(id, model)` key lands the score on the right row IN THE RIGHT SPACE.

import type { EmbeddingsContext } from "../context";
import type { WriteHubScoresParams } from "../contract/params";
import type { WriteHubScoresResult } from "../contract/results";
import type { EmbeddingsService } from "../contract/service";
import { writeHubScoreRows } from "../persistence/queries";

export function createWriteHubScores(ctx: EmbeddingsContext): EmbeddingsService["writeHubScores"] {
  return async (params: WriteHubScoresParams): Promise<WriteHubScoresResult> => {
    const rowsUpdated = await writeHubScoreRows(ctx.db, params.table, params.updates);
    return { rowsUpdated };
  };
}
