import type { TurnRetrievalEvents } from "@orb/contracts/chat";
import type { RetrievalFallback } from "@orb/contracts/search";
import type { DatabankService } from "./service.ts";

export type RetrievalDegrade = <T>(run: () => Promise<T>, degraded: RetrievalFallback<T>) => Promise<T>;
export type GatherDatabankForTurn = (
  args: Parameters<DatabankService["gatherRetrieval"]>[0],
  events?: TurnRetrievalEvents | undefined,
) => ReturnType<DatabankService["gatherRetrieval"]>;
