import type { UserId } from "@orb/kit/ids";
import type { backfillGroupCharacters, backfillMemory } from "../substrate/backfill.ts";
import type { estimateMemoryBackfillCalls } from "../substrate/backfill-estimate.ts";
export interface ChatBoundBackfillOps {
  readonly isMemoryEnabled: (hostUserId: UserId) => Promise<boolean>;
  readonly backfill: {
    readonly memory: (args: Parameters<typeof backfillMemory>[1]) => ReturnType<typeof backfillMemory>;
    readonly groupCharacters: (args: Parameters<typeof backfillGroupCharacters>[1]) => ReturnType<typeof backfillGroupCharacters>;
    readonly estimateMemory: (args: Parameters<typeof estimateMemoryBackfillCalls>[1]) => ReturnType<typeof estimateMemoryBackfillCalls>;
  };
}
