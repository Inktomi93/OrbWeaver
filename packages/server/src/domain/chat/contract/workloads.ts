// domain/chat/contract/workloads — the DI bundle chat's `WorkloadContribution` factory closes over. The two
// corpus sweeps are chat-ctx-bound ops (compose binds them over the chat context); `purgeMemoryVectors` is
// the ONE cross-domain reach, declared here as an injected-op TYPE and wired at the composition root —
// never a sideways import, and never a shared cross-feature hub.

import type { BackfillPassResult, MemoryBackfillResult } from "@orb/contracts/chat";
import type { UserId } from "@orb/kit/ids";

/** A corpus sweep's argument bundle: the enumeration scope (`null` = the bulk all-owners pass) + the signal. */
interface CorpusSweepArgs {
  readonly ownerId: UserId | null;
  /** WHO FUNDS the sweep's summarize calls — the workload's acting user (`WorkloadRunContext.userId`). */
  readonly funderUserId: UserId;
  readonly signal: AbortSignal;
}

export interface ChatWorkloadDeps {
  /** The memory subsystem's corpus-wide segment/digest rebuild (idempotent, hash-diff resumable). */
  readonly backfillMemory: (args: CorpusSweepArgs) => Promise<MemoryBackfillResult>;
  /** Mint the synthetic group character for every multi-character room that lacks one (PD-41/D38). */
  readonly backfillGroupCharacters: (args: CorpusSweepArgs) => Promise<BackfillPassResult>;
  /** PD-139(b): reclaim the OLD chat-memory embed space after a BULK backfill re-derives everything into
   *  the active one. The DELETE lives in embeddings/persistence (the ONE vector write path) — this is the
   *  injected op, never a db reach from chat. */
  readonly purgeMemoryVectors: () => Promise<void>;
  /** Is the memory subsystem ON for this host (#156)? Resolved through the ONE memory-config merge
   *  (`entry/compose/chat.ts resolveMemoryConfig`: admin defaults ⊕ the host's `memory.enabled` opt-out), so
   *  the admission gate cannot drift from the sweep's own per-host skip (#54) or from the live turn. Injected
   *  because settings is not chat's to read — the same seam shape `ResolveBackfillMemoryConfig` uses. */
  readonly isMemoryEnabled: (hostUserId: UserId) => Promise<boolean>;
}
