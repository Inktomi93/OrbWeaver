// Chat owns conversion of inert assembly operands into its private query/accounting context.

import { batchHandle, databaseForOwner, databaseHandle } from "@orb/db/wiring-owner";
import type { ChatContext } from "./contract/context.ts";
import type { ChatAssemblyContext } from "./contract/wiring.ts";

export type { ChatContext, ChatServiceDeps } from "./contract/context.ts";

/** Preserve each operation's actual connection and mutable batch across the accounting seam. */
export function createChatContext(input: ChatAssemblyContext): ChatContext {
  return {
    ...input,
    db: databaseForOwner(input.db),
    applyStatsDelta: (batch, db, delta) => input.applyStatsDelta(batchHandle(batch), databaseHandle(db), delta),
    applyCharacterStatsDelta: (batch, db, delta) => input.applyCharacterStatsDelta(batchHandle(batch), databaseHandle(db), delta),
    settleRetainedChatRebase: (batch, db, scope) => input.settleRetainedChatRebase(batchHandle(batch), databaseHandle(db), scope),
    bumpStatsCanonVersion: (batch, db, ownerId) => input.bumpStatsCanonVersion(batchHandle(batch), databaseHandle(db), ownerId),
  };
}
