// domain/rpg/verbs/checkpoint/restore-checkpoint — restoreCheckpoint (rpg-design/05 §4.4). Clones the
// checkpointed snapshot FORWARD, born committed, onto a FRESH narrator slot (the injected `postNarratorMessage`
// mints the message+variant; W1a's `writeRestoredSnapshot` keys the clone to it). Host-gated, game-scoped (a
// foreign game's checkpoint id → leak-free NOT-FOUND).

import { DomainNotFoundError } from "@orb/kit/errors";
import type { RestoreCheckpointParams } from "../../contract/params";
import type { RpgContext, RpgService } from "../../contract/service";
import { resolveHost } from "../../guard";
import { findCheckpoint } from "../../persistence/checkpoints";
import { findSnapshotById, writeRestoredSnapshot } from "../../persistence/snapshots";

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
    // Mint a fresh narrator slot; clone the checkpointed snapshot forward onto it, BORN COMMITTED.
    const posted = await ctx.postNarratorMessage(game.chatId, RESTORE_MESSAGE);
    const snapshotId = ctx.ids.snapshot();
    await writeRestoredSnapshot(ctx.db, base, {
      id: snapshotId,
      gameId: game.id,
      messageId: posted.messageId,
      variantId: posted.variantId,
      now: ctx.now(),
    });
    // The restored snapshot is the new resolved-current head → the whole panel re-resolves (§4.9).
    ctx.emitBus({ type: "snapshotPatched", chatId: params.chatId, snapshotId });
  }
  return { restoreCheckpoint };
}
