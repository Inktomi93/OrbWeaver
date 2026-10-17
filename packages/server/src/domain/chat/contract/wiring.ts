import type { DbAssemblyInput } from "@orb/db/wiring";
import type { StatsBatchWiring } from "#domain/stats";
import type { ChatContext } from "./context.ts";

export type ChatAssemblyContext = Omit<DbAssemblyInput<ChatContext>, keyof StatsBatchWiring> & StatsBatchWiring;
