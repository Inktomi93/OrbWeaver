import type { DbAssemblyInput } from "@orb/db/wiring";
import type { ChatContext } from "./context.ts";
import type { ChatStatsBatchWiring } from "./stats-batch.ts";

export type ChatAssemblyContext = Omit<DbAssemblyInput<ChatContext>, keyof ChatStatsBatchWiring> & ChatStatsBatchWiring;
