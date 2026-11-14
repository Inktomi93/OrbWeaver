// Chat owns conversion of inert assembly operands into its private query/accounting context.
//
// It also binds the subsystem ops a flat verb cannot import (`domain-substrate-mediates-subsystems`): the turn
// gather in `assembly/` with its `memory/` reads, and the `memory/backfill/` sweeps. Core-0 §4 wires a runtime
// op at the composition root; `service.ts` injects `recallMemory` into the engine the same way.

import { batchHandle, databaseForOwner } from "@orb/db/wiring-owner";
import { gatherAssembleContext } from "./assembly/gather.ts";
import type { ChatBoundBackfillOps } from "./contract/bound-backfill.ts";
import type { ChatContext } from "./contract/context.ts";
import type { MemoryConfig, ResolveBackfillMemoryConfig } from "./contract/memory.ts";
import type { ChatAssemblyContext } from "./contract/wiring.ts";
import { backfillGroupCharacters, backfillMemory } from "./memory/backfill/backfill.ts";
import { estimateMemoryBackfillCalls } from "./memory/backfill/estimate.ts";
import { loadTranscriptNames } from "./memory/persistence/queries.ts";
import { recallMemory } from "./memory/recall/recall.ts";
import { emptyMemoryScopePredicate, loadBackfillChatIds } from "./persistence/backfill-scope.ts";

/**
 * Preserve each operation's mutable batch across the accounting seam.
 * @remarks The seam receives the handle the caller supplied, never a re-minted one: every verb passes `ctx.db`,
 * which is the connection `input.db` names, so the handle and the operation's connection are the same.
 */
export function createChatContext(input: ChatAssemblyContext): ChatContext {
  const ctx: ChatContext = {
    ...input,
    db: databaseForOwner(input.db),
    applyStatsDelta: (batch, _db, delta) => input.applyStatsDelta(batchHandle(batch), input.db, delta),
    applyCharacterStatsDelta: (batch, _db, delta) => input.applyCharacterStatsDelta(batchHandle(batch), input.db, delta),
    settleRetainedChatRebase: (batch, _db, scope) => input.settleRetainedChatRebase(batchHandle(batch), input.db, scope),
    bumpStatsCanonVersion: (batch, _db, ownerId) => input.bumpStatsCanonVersion(batchHandle(batch), input.db, ownerId),
    shiftCharacterCensus: (batch, _db, shift) => input.shiftCharacterCensus(batchHandle(batch), input.db, shift),
    recordLedgerSpend: (batch, _db, spend) => input.recordLedgerSpend(batchHandle(batch), input.db, spend),
    gatherAssembleContext: (...args) => gatherAssembleContext({ ctx, memoryOps: { recallMemory, loadTranscriptNames } }, ...args),
  };
  return ctx;
}

/** Singular pre-enable estimates ignore that host's opt-out; bulk estimates honor every host's live switch. */
export function createChatBoundBackfillOps(
  input: ChatAssemblyContext,
  resolveMemoryConfig: ResolveBackfillMemoryConfig,
  readDefaults: () => MemoryConfig,
): ChatBoundBackfillOps {
  const ctx = createChatContext(input);
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
