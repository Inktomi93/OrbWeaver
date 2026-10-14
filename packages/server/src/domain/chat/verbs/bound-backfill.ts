import type { ChatBoundBackfillOps } from "../contract/bound-backfill.ts";
import type { ChatContext } from "../contract/context.ts";
import type { MemoryConfig, ResolveBackfillMemoryConfig } from "../contract/memory.ts";
import { emptyMemoryScopePredicate, loadBackfillChatIds } from "../persistence/backfill-scope.ts";
import { backfillGroupCharacters, backfillMemory } from "../substrate/backfill.ts";
import { estimateMemoryBackfillCalls } from "../substrate/backfill-estimate.ts";
/** Singular pre-enable estimates ignore that host's opt-out; bulk estimates honor every host's live switch. */
export function createChatBoundBackfillOps(
  ctx: ChatContext,
  resolveMemoryConfig: ResolveBackfillMemoryConfig,
  readDefaults: () => MemoryConfig,
): ChatBoundBackfillOps {
  return {
    isMemoryEnabled: async (hostUserId) => (await resolveMemoryConfig(hostUserId)).mode !== "off",
    emptyMemoryScope: async (hostUserId) => ((await loadBackfillChatIds(ctx.db, hostUserId)).length === 0 ? emptyMemoryScopePredicate(hostUserId) : null),
    backfill: {
      memory: (args) => backfillMemory(ctx, args, resolveMemoryConfig),
      groupCharacters: (args) => backfillGroupCharacters(ctx, args),
      estimateMemory: (args) =>
        estimateMemoryBackfillCalls(ctx, args, args.ownerId === null ? resolveMemoryConfig : (): Promise<MemoryConfig> => Promise.resolve(readDefaults())),
    },
  };
}
