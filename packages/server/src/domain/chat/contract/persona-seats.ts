import type { DurableChatBusEvent } from "@orb/contracts/chat";
import type { Db } from "@orb/db";

export interface PersonaSeatReseatDeps {
  readonly db: Db;
  readonly emit: (event: DurableChatBusEvent) => Promise<unknown>;
}
