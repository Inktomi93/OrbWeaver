// domain/rpg/verbs/checkpoint/restore-checkpoint — restoreCheckpoint (rpg-design/05 §4.4). Clones the
// checkpointed snapshot FORWARD, born committed, as a HAND ROW (D124 fork 4: variant-keyed IFF turn flush —
// a restore is not a turn). The visible "— scene restored —" notice is posted as REAL PROSE and is now purely
// a notice: nothing is keyed to it, so swiping or deleting it can never orphan the restored state. Host-gated,
// game-scoped (a foreign game's checkpoint id → leak-free NOT-FOUND).

import { DomainNotFoundError } from "@orb/kit/errors";
import type { RestoreCheckpointParams } from "../../contract/params.ts";
import type { RpgContext, RpgService } from "../../contract/service.ts";
import { resolveHost } from "../../guard.ts";
import { findCheckpoint } from "../../persistence/checkpoints.ts";
import { findSnapshotById, writeRestoredSnapshot } from "../../persistence/snapshots.ts";

const RESTORE_MESSAGE = "— scene restored —";

export function createRestoreCheckpoint(ctx: RpgContext): Pick<RpgService, "restoreCheckpoint"> {
  async function restoreCheckpoint(params: RestoreCheckpointParams): Promise<void> {
    const { game } = await resolveHost(ctx, params.principal, params.chatId);
    const checkpoint = await findCheckpoint(ctx.db, params.checkpointId);
    if (checkpoint === undefined || checkpoint.gameId !== game.id) {
      throw new DomainNotFoundError("checkpoint", params.checkpointId);
    }
    // The checkpointed snapshot IS the restore base — read it by its durable id.
    const base = await findSnapshotById(ctx.db, checkpoint.snapshotId);
    if (base === undefined) {
      throw new DomainNotFoundError("snapshot", checkpoint.snapshotId);
    }
    // Post the visible notice FIRST so the restored hand row's as-of stamp lands on it (the state is "as of"
    // the restore line the reader sees), then clone the checkpointed snapshot forward, BORN COMMITTED.
    await ctx.postNarratorMessage(game.chatId, RESTORE_MESSAGE);
    const snapshotId = ctx.ids.snapshot();
    await writeRestoredSnapshot(ctx.db, base, { id: snapshotId, gameId: game.id, chatId: game.chatId, now: ctx.now() });
    // The restored snapshot is the new resolved-current head → the whole panel re-resolves (§4.9).
    ctx.emitBus({ type: "snapshotPatched", chatId: params.chatId, snapshotId });
  }
  return { restoreCheckpoint };
}
