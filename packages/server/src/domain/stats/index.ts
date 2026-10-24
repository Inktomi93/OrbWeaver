// Front door for stats reads, workload composition and batched write operations.
// Cross-boundary shapes and pure tally primitives stay in their canonical contracts and kit homes.

export type { StatsService, StatsWorkloadDeps } from "./contract/service.ts";

export type { StatsBatchWiring } from "./contract/wiring.ts";
export { createResolveRetainedChatAccountingScope, createResolveRetainedChatRebase } from "./persistence/retained-chat-accounting.ts";
export { createStatsService } from "./service.ts";
export { createStatsWorkloadContributions } from "./workload-contributions.ts";

// `reconcileOwnersMissingTimeline` rebuilds every owner's timeline, so it takes `BootDatabaseHandle`, which only boot mints (D335).
export { createStatsBatchWiring, reconcileOwnersMissingTimeline, reconcileStats } from "./write/wiring.ts";
