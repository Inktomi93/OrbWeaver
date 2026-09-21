// The TURN-SCOPED retrieval-degrade episode. A turn's retrieval can fail independently at round level, again
// for each scoped speaker, and once more for the databank slot — but the chat bus must tell the user once per
// turn per outage class, never once per call and never through global client coalescing. A new gathered turn
// constructs a new episode.
//
// IT LIVES IN `substrate/`, NOT UNDER `memory/recall/` (#2510): `gatherAll` constructs it and hands the SAME
// object to BOTH gather arms, so it is a property of the turn's assembly, not of the memory subsystem. It was
// `memory/recall/rerank-warning.ts` while recall was its only producer.

import type { TurnRetrievalWarningEpisode } from "../contract/memory.ts";

/** One report/take latch: `take` answers true exactly once, and only after a report. */
function latch(): { readonly report: () => void; readonly take: () => boolean } {
  let reported = false;
  let taken = false;
  return {
    report: (): void => {
      reported = true;
    },
    take: (): boolean => {
      if (!reported || taken) {
        return false;
      }
      taken = true;
      return true;
    },
  };
}

/** Two INDEPENDENT latches, deliberately not one flag — a rerank outage means the turn retrieved and lost only
 *  the cross-encoder order, an unqueryable space means it retrieved nothing. One turn can hit both. */
export function createTurnRetrievalWarningEpisode(): TurnRetrievalWarningEpisode {
  const rerank = latch();
  const index = latch();
  return {
    reportRerankUnavailable: rerank.report,
    takeRerankUnavailable: rerank.take,
    reportIndexUnavailable: index.report,
    takeIndexUnavailable: index.take,
  };
}
