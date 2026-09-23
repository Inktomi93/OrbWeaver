// domain/rpg/staging — the Option-A in-memory staging accumulator SINGLETON (docs/plans/rpg/design.md). A STATEFUL
// feature-root collaborator (a per-turn bucket Map), NOT a pure `substrate/` helper — the `chat/active-turns.ts`
// precedent (the feature-structure allowlist pre-documents this root file). The pure merge engine it overlays
// with (`applyLockedPatch`) stays in `substrate/merge.ts`.
//
// WHY it exists: the engine mints the assistant `message_variants` row only at COMMIT, so mid-turn tool
// writes have nothing to key a durable snapshot on. The accumulator holds a turn's effective state in
// memory, keyed by the turn's ephemeral `ChatTurnId`, until `onTurnCompleted` flushes it to a real snapshot
// (or `onTurnAborted` discards it). Writing per-tool straight to durable rows would make an ABORTED turn's
// writes canon — the exact corruption class this layer kills.
//
// ASSUMES(single-replica): a turn's tools and its flush run in ONE process under the chat lock. The bucket
// map is process-local; a multi-replica deploy would need a shared store. Same posture as the rest of the
// engine (the chat-turn lock, the session cache).
//
// KEYED BY `ChatTurnId`, NOT bare `chatId` (load-bearing): a lock-free `generate` can run CONCURRENT with a
// locked `send` on ONE chat — two turns must not share a bucket, or one turn's staged writes would leak into
// the other's flush. The `turnId` threaded on `ToolExecutionContext` (tool-use/contract/params.ts) is this
// correlation key.
//
// READ-THROUGH: a tool reads the turn's CURRENT effective state (the base overlaid by every earlier staged
// write in the same turn) — so tool 2 sees tool 1's mutation (a quest created by tool 1 is visible to tool
// 2's flip). The bucket is seeded from the resolution-ladder base on first touch; each staged patch overlays
// via `applyLockedPatch` (locks honored, [merge-clear] contract).

import type { RpgSnapshotState } from "@orb/contracts/rpg";
import type { ChatTurnId } from "@orb/kit/ids";
import type { StagedJournalEntry, StagedPatch, StagedTurnFlush } from "./contract/params.ts";
import type { RpgStagingStore } from "./contract/service.ts";
import { applyLockedPatchTracked } from "./substrate/merge.ts";

/** One turn's in-flight accumulation: the effective snapshot state (base + every staged overlay), the staged
 *  journal entries (flushed stamped with the committed variant at turn-end), and the raw PATCHES that produced
 *  the state. Module-private.
 *
 *  The patch log is not bookkeeping: the flush's post-write fold replays it onto the hand head, and replaying
 *  the composed STATE instead would re-assert this turn's now-stale base over a hand edit that landed mid-flight
 *  (see `StagedTurnFlush.patches`). */
interface TurnBucket {
  state: RpgSnapshotState;
  readonly journal: StagedJournalEntry[];
  /** The dotted paths this turn's writes lost to the base snapshot's hand LOCKS (#77). Collected where the
   *  drop happens (`substrate/merge.ts`) because a state diff after the fact cannot tell a lock from a model
   *  that never wrote; the flush hands them to the turn's tool-call record so the disclosure stops reporting
   *  `applied` about a write no state carries. Deduplicated across the turn's stages. */
  readonly suppressed: string[];
  /** Each staged write PAIRED with the state it was composed against (see {@link StagedPatch}). The fold
   *  rebases off that pairing; a single seed base shared by every patch double-counts what an earlier patch in
   *  the same turn already added. */
  readonly patches: StagedPatch[];
}

/** Build the staging store (a compose-created singleton — one per server process). Deep-clones the seed base
 *  so a caller's row object can't be mutated through the bucket (and the bucket can't be mutated by a later
 *  re-read of the same row). */
export function createRpgStagingStore(): RpgStagingStore {
  const buckets = new Map<ChatTurnId, TurnBucket>();

  function clone<T>(value: T): T {
    return structuredClone(value);
  }

  return {
    ensure(turnId: ChatTurnId, base: RpgSnapshotState): RpgSnapshotState {
      const existing = buckets.get(turnId);
      if (existing) {
        return existing.state;
      }
      const bucket: TurnBucket = { state: clone(base), journal: [], patches: [], suppressed: [] };
      buckets.set(turnId, bucket);
      return bucket.state;
    },
    peek(turnId: ChatTurnId): RpgSnapshotState | undefined {
      return buckets.get(turnId)?.state;
    },
    stage(turnId: ChatTurnId, patch: Record<string, unknown>): RpgSnapshotState {
      const bucket = buckets.get(turnId);
      if (!bucket) {
        throw new Error(`rpg staging: stage() before ensure() for turn ${turnId}`);
      }
      // Recorded BEFORE the merge and DEEP-CLONED, for the same reason `ensure` clones its seed: neither the
      // caller's patch object nor the state handed out by the read-through may stay live in the log (a later
      // mutation of either would rewrite the history the fold replays). `bucket.state` here is EXACTLY the
      // state this patch's applier composed against — capturing it is what makes the entry self-describing.
      bucket.patches.push({ patch: clone(patch), base: clone(bucket.state) });
      // THE FIRST OF THE TWO SUPPRESSION SITES (#77): the base carries the locks a hand edit stamped in an
      // EARLIER beat, so an ordinary turn writing a pinned path is dropped right here — before any snapshot
      // exists and long before the flush's fold, which only runs when a hand row lands mid-flight.
      const merged = applyLockedPatchTracked(bucket.state as unknown as Record<string, unknown>, patch, bucket.state.fieldLocks);
      bucket.state = merged.state as unknown as RpgSnapshotState;
      for (const path of merged.suppressed) {
        if (!bucket.suppressed.includes(path)) {
          bucket.suppressed.push(path);
        }
      }
      return bucket.state;
    },
    stageJournal(turnId: ChatTurnId, entry: StagedJournalEntry): void {
      const bucket = buckets.get(turnId);
      if (!bucket) {
        throw new Error(`rpg staging: stageJournal() before ensure() for turn ${turnId}`);
      }
      bucket.journal.push(entry);
    },
    take(turnId: ChatTurnId): StagedTurnFlush | undefined {
      const bucket = buckets.get(turnId);
      if (!bucket) {
        return;
      }
      buckets.delete(turnId);
      return { state: bucket.state, journal: bucket.journal, patches: bucket.patches, suppressedByLocks: bucket.suppressed };
    },
    clear(turnId: ChatTurnId): void {
      buckets.delete(turnId);
    },
  };
}
