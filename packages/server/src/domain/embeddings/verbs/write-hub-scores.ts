// verb: writeHubScores — the `discovery` → embeddings hub-score write seam (the ONLY non-`store` UPDATE —
// the document_chunks reclaim DELETEs prune/purge are the other non-`store` writes — and
// the ONLY path that touches `hub_score`; §invariant 3). It takes the PRE-COMPUTED scores as data and does a
// batch UPDATE keyed `(id, model)` — NO CSLS math here (discovery computes, embeddings stores, search reads).
// Handles a batch of ANY size (a bulk UPDATE, not a matrix op — the dense-vs-streaming threshold is entirely
// discovery's concern). The `(id, model)` key lands the score on the right row IN THE RIGHT SPACE.

import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import type { WriteHubScoresParams, WriteHubScoresResult } from "@orb/contracts/embeddings";
import type { EmbeddingsContext, EmbeddingsService } from "../contract/service.ts";
import { writeHubScoreRows } from "../persistence/queries.ts";

/** Updates per `db.batch`. One statement is tens of microseconds of synchronous driver work, so a bounded chunk
 *  keeps each turn of the event loop short; a whole 100,000-row pass in one batch holds it for seconds. */
const HUB_SCORE_WRITE_CHUNK = 500;

export function createWriteHubScores(ctx: EmbeddingsContext): EmbeddingsService["writeHubScores"] {
  return async (params: WriteHubScoresParams): Promise<WriteHubScoresResult> => {
    let rowsUpdated = 0;
    for (let start = 0; start < params.updates.length; start += HUB_SCORE_WRITE_CHUNK) {
      if (start > 0) {
        await yieldToEventLoop();
      }
      rowsUpdated += await writeHubScoreRows(ctx.db, params.table, params.updates.slice(start, start + HUB_SCORE_WRITE_CHUNK));
    }
    return { rowsUpdated };
  };
}
