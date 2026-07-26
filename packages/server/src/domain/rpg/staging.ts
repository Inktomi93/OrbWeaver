// domain/rpg/staging — the Option-A in-memory staging accumulator SINGLETON (rpg-design/05 §2.4). A STATEFUL
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
import type { StagedJournalEntry, StagedTurnFlush } from "./contract/params";
import type { RpgStagingStore } from "./contract/service";
import { applyLockedPatch } from "./substrate/merge";

/** One turn's in-flight accumulation: the effective snapshot state (base + every staged overlay) and the
 *  staged journal entries (flushed stamped with the committed variant at turn-end). Module-private. */
interface TurnBucket {
  state: RpgSnapshotState;
  readonly journal: StagedJournalEntry[];
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
      const bucket: TurnBucket = { state: clone(base), journal: [] };
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
      bucket.state = applyLockedPatch(bucket.state as unknown as Record<string, unknown>, patch, bucket.state.fieldLocks) as unknown as RpgSnapshotState;
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
      return { state: bucket.state, journal: bucket.journal };
    },
    clear(turnId: ChatTurnId): void {
      buckets.delete(turnId);
    },
  };
}
