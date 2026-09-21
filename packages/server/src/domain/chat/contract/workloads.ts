// domain/chat/contract/workloads — the DI bundle chat's `WorkloadContribution` factory closes over. The two
// corpus sweeps are chat-ctx-bound ops (compose binds them over the chat context); `purgeMemoryVectors` is
// the ONE cross-domain reach, declared here as an injected-op TYPE and wired at the composition root —
// never a sideways import, and never a shared cross-feature hub.

import type { BackfillPassResult } from "@orb/contracts/chat";
import type { UserId } from "@orb/kit/ids";
import type { MemoryBackfillSweepCounts, MemoryEmbedSpace } from "./memory.ts";

/** A corpus sweep's argument bundle: the enumeration scope (`null` = the bulk all-owners pass) + the signal. */
interface CorpusSweepArgs {
  readonly ownerId: UserId | null;
  /** WHO FUNDS the sweep's summarize calls — the workload's acting user (`WorkloadRunContext.userId`). */
  readonly funderUserId: UserId;
  readonly signal: AbortSignal;
}

export interface ChatWorkloadDeps {
  /** The memory subsystem's corpus-wide segment/digest rebuild (idempotent, hash-diff resumable). */
  readonly backfillMemory: (args: CorpusSweepArgs) => Promise<MemoryBackfillSweepCounts>;
  /** Mint the synthetic group character for every multi-character room that lacks one (PD-41/D38). */
  readonly backfillGroupCharacters: (args: CorpusSweepArgs) => Promise<BackfillPassResult>;
  /** The memory sweep's TERMINAL: record `embed_space_state`'s `memory` completion for every space the
   *  sweep brought current and — once cards, memory AND documents all name the same target generation —
   *  reclaim the rows stranded in an older embed space (PD-139(b)).
   *
   *  THE ENUMERATION SCOPE IS AN ARGUMENT, not a caller-side fence (#2517). The op enumerates exactly the
   *  scope it is handed: `null` = every corpus owner (the bulk arm), a `UserId` = that one owner. That is
   *  what keeps a per-owner catch-up off a neighbour's space — and it is why the COMPLETION half no longer
   *  has to be suppressed on the singular arm, which had left an owner whose memory was perfectly current
   *  reading `moving` forever.
   *
   *  The DELETE lives in embeddings/persistence (the ONE vector write path) — this is the injected op,
   *  never a db reach from chat. */
  readonly purgeMemoryVectors: (spaces: readonly MemoryEmbedSpace[], enumerationScope: UserId | null) => Promise<void>;
  /** Is the memory subsystem ON for this host (#156)? Resolved through the ONE memory-config merge
   *  (`entry/compose/chat.ts resolveMemoryConfig`: admin defaults ⊕ the host's `memory.enabled` opt-out), so
   *  the admission gate cannot drift from the sweep's own per-host skip (#54) or from the live turn. Injected
   *  because settings is not chat's to read — the same seam shape `ResolveBackfillMemoryConfig` uses. */
  readonly isMemoryEnabled: (hostUserId: UserId) => Promise<boolean>;
}
