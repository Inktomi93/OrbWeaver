// domain/rpg/verbs/checkpoint/restore-checkpoint — restoreCheckpoint (docs/plans/rpg/design.md). Clones the
// checkpointed snapshot FORWARD, born committed, as a HAND ROW (D124 fork 4: variant-keyed IFF turn flush —
// a restore is not a turn). The visible "— scene restored —" notice is REAL PROSE and the restored hand row's
// as-of stamp names that marker. Both commit in chat's existing narrator batch; swiping the notice still cannot
// orphan the state because the hand row carries no variant FK. Host-gated, game-scoped (a foreign game's
// checkpoint id → leak-free NOT-FOUND).

import { statementToken } from "@orb/db/wiring-owner";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { RestoreCheckpointParams } from "#src/domain/rpg/contract/params.ts";
import type { RpgContext, RpgService } from "#src/domain/rpg/contract/service.ts";
import { resolveHost } from "#src/domain/rpg/guard.ts";
import { findCheckpoint } from "#src/domain/rpg/persistence/checkpoints.ts";
import { buildRestoredSnapshotStatement, findSnapshotById } from "#src/domain/rpg/persistence/snapshots.ts";
import { serializeHandWrite } from "#src/domain/rpg/snapshot-edit.ts";

const RESTORE_MESSAGE = "— scene restored —";

export function createRestoreCheckpoint(ctx: RpgContext): Pick<RpgService, "restoreCheckpoint"> {
  async function restoreCheckpoint(params: RestoreCheckpointParams): Promise<void> {
    const { game } = await resolveHost(ctx, params.principal, params.chatId);
    await ctx.claimChat(params.chatId);
    const snapshotId = await serializeHandWrite(game.id, async () => {
      const checkpoint = await findCheckpoint(ctx.db, params.checkpointId);
      if (checkpoint === undefined || checkpoint.gameId !== game.id) {
        throw new DomainNotFoundError("checkpoint", params.checkpointId);
      }
      // The checkpointed snapshot IS the restore base — read it by its durable id.
      const base = await findSnapshotById(ctx.db, checkpoint.snapshotId);
      if (base === undefined) {
        throw new DomainNotFoundError("snapshot", checkpoint.snapshotId);
      }
      const restoredId = ctx.ids.snapshot();
      // The narrator/state batch stays inside the same owner as hand edits; neither writer resolves past it.
      await ctx.postNarratorMessage(game.chatId, RESTORE_MESSAGE, ({ messageId }) =>
        statementToken(buildRestoredSnapshotStatement(ctx.db, base, { id: restoredId, gameId: game.id, now: ctx.now() }, messageId)),
      );
      return restoredId;
    });
    // The restored snapshot is the new resolved-current head → the whole panel re-resolves (§4.9).
    ctx.emitBus({ type: "snapshotPatched", chatId: params.chatId, snapshotId });
  }
  return { restoreCheckpoint };
}
