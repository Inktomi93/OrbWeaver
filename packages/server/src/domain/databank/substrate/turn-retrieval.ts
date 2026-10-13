// A missing/rebuilding space is the ruled empty bank; the injected classifier propagates unrelated faults.

import type { DatabankService } from "../contract/service.ts";
import type { GatherDatabankForTurn, RetrievalDegrade } from "../contract/turn-retrieval.ts";

export function createGatherDatabankForTurn(gather: DatabankService["gatherRetrieval"], degrade: RetrievalDegrade): GatherDatabankForTurn {
  return (args, events): ReturnType<GatherDatabankForTurn> =>
    degrade(async () => await gather(args), { empty: null, onIndexUnavailable: events?.onIndexUnavailable });
}
