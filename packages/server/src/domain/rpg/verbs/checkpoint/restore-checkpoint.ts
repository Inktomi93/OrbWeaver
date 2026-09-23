// domain/rpg/verbs/checkpoint/restore-checkpoint — restoreCheckpoint (docs/plans/rpg/design.md). Clones the
// checkpointed snapshot FORWARD, born committed, as a HAND ROW (D124 fork 4: variant-keyed IFF turn flush —
// a restore is not a turn). The visible "— scene restored —" notice is REAL PROSE and the restored hand row's
// as-of stamp names that marker. Both commit in chat's existing narrator batch; swiping the notice still cannot
// orphan the state because the hand row carries no variant FK. Host-gated, game-scoped (a foreign game's
// checkpoint id → leak-free NOT-FOUND).

import { DomainNotFoundError } from "@orb/kit/errors";
import type { RestoreCheckpointParams } from "../../contract/params.ts";
import type { RpgContext, RpgService } from "../../contract/service.ts";
import { resolveHost } from "../../guard.ts";
import { findCheckpoint } from "../../persistence/checkpoints.ts";
import { buildRestoredSnapshotStatement, findSnapshotById } from "../../persistence/snapshots.ts";

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
    const snapshotId = ctx.ids.snapshot();
    // Chat mints the visible marker ids before its batch, then asks RPG for exactly one unexecuted companion
    // statement. The marker remains the hand row's D124 ordering stamp, while either statement failing rolls
    // both back and a retry starts from no visible half.
    await ctx.postNarratorMessage(game.chatId, RESTORE_MESSAGE, ({ messageId }) =>
      buildRestoredSnapshotStatement(ctx.db, base, { id: snapshotId, gameId: game.id, now: ctx.now() }, messageId),
    );
    // The restored snapshot is the new resolved-current head → the whole panel re-resolves (§4.9).
    ctx.emitBus({ type: "snapshotPatched", chatId: params.chatId, snapshotId });
  }
  return { restoreCheckpoint };
}
