// domain/chat/contract/workloads — the DI bundle chat's `WorkloadContribution` factory closes over. The two
// corpus sweeps are chat-ctx-bound ops (compose binds them over the chat context); `purgeMemoryVectors` is
// the ONE cross-domain reach, declared here as an injected-op TYPE and wired at the composition root —
// never a sideways import, and never a shared cross-feature hub.

import type { BackfillPassResult, ImportWindow } from "@orb/contracts/chat";
import type { UserId } from "@orb/kit/ids";
import type { MemoryBackfillSweepCounts, MemoryEmbedSpace } from "./memory.ts";

/** A corpus sweep's argument bundle: the enumeration scope (`null` = the bulk all-owners pass) + the signal. */
interface CorpusSweepArgs {
  readonly ownerId: UserId | null;
  /** WHO FUNDS the sweep's summarize calls — the workload's acting user (`WorkloadRunContext.userId`). */
  readonly funderUserId: UserId;
  readonly signal: AbortSignal;
}

/** The memory sweep's arguments: the corpus scope, narrowed to the chats an import wrote when `importWindow` is set
 *  (`null` = every chat in scope). `segmentsOnly` builds the verbatim segments and plans no digest. */
export interface MemorySweepArgs extends CorpusSweepArgs {
  readonly importWindow: ImportWindow | null;
  readonly segmentsOnly: boolean;
  /** Called as each phase of {@link MEMORY_SWEEP_STEPS} starts, so the progress row names the running phase. */
  readonly onProgress?: ((step: MemorySweepStep) => void) | undefined;
}

/** The memory sweep's phases in run order — the progress rows an embedder switch's re-index shows. */
export const MEMORY_SWEEP_STEPS = ["planning chats", "embedding transcripts", "summarizing", "writing digests"] as const;
export type MemorySweepStep = (typeof MEMORY_SWEEP_STEPS)[number];

export interface ChatWorkloadDeps {
  /** The memory subsystem's corpus-wide segment/digest rebuild (idempotent, hash-diff resumable). */
  readonly backfillMemory: (args: MemorySweepArgs) => Promise<MemoryBackfillSweepCounts>;
  /** The Utility-model calls {@link backfillMemory} would make over the scope, read without planning or writing. */
  readonly estimateMemoryBackfill: (args: Omit<MemorySweepArgs, "signal" | "segmentsOnly">) => Promise<number>;
  /** Mint the synthetic group character for every multi-character room that lacks one (D38). */
  readonly backfillGroupCharacters: (args: CorpusSweepArgs) => Promise<BackfillPassResult>;
  /** The memory sweep's TERMINAL: record `embed_space_state`'s `memory` completion for every space the
   *  sweep brought current; the promotion lands once cards, memory AND documents name the same target.
   *
   *  THE ENUMERATION SCOPE IS AN ARGUMENT, not a caller-side fence. The op enumerates exactly the scope it is
   *  handed: `null` = every corpus owner (the bulk arm), a `UserId` = that one owner, so a per-owner catch-up
   *  never reaches a neighbour's space. The state write lives in embeddings/persistence — this is the injected
   *  op, never a db reach from chat. */
  readonly purgeMemoryVectors: (spaces: readonly MemoryEmbedSpace[], enumerationScope: UserId | null) => Promise<void>;
  /** Is the memory subsystem ON for this host (#156)? Resolved through the ONE memory-config merge
   *  (`entry/compose/chat.ts resolveMemoryConfig`: admin defaults ⊕ the host's `memory.enabled` opt-out), so
   *  the admission gate cannot drift from the sweep's own per-host skip (#54) or from the live turn. Injected
   *  because settings is not chat's to read — the same seam shape `ResolveBackfillMemoryConfig` uses. */
  readonly isMemoryEnabled: (hostUserId: UserId) => Promise<boolean>;
}
