import type { TurnRetrievalEvents } from "@orb/contracts/chat";
import type { DatabankService } from "./service.ts";

export type GatherDatabankForTurn = (
  args: Parameters<DatabankService["gatherRetrieval"]>[0],
  events?: TurnRetrievalEvents | undefined,
) => ReturnType<DatabankService["gatherRetrieval"]>;
