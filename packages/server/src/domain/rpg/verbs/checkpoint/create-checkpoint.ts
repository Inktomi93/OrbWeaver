// Host bookmarks resolve inside hand-write ownership; turn rows detach because continuation can replace them.
// The committed hand clone and its label share one batch, while existing immutable hand rows are reused.

import { DomainNotFoundError } from "@orb/kit/errors";
import type { RpgCheckpointId } from "@orb/kit/ids";
import type { CreateCheckpointParams } from "#src/domain/rpg/contract/params.ts";
import type { RpgContext, RpgService } from "#src/domain/rpg/contract/service.ts";
import { resolveHost } from "#src/domain/rpg/guard.ts";
import { insertCheckpoint } from "#src/domain/rpg/persistence/checkpoints.ts";
import { buildCheckpointSnapshotStatements, resolveSnapshotForTurn } from "#src/domain/rpg/persistence/snapshots.ts";

export function createCreateCheckpoint(ctx: RpgContext): Pick<RpgService, "createCheckpoint"> {
  async function createCheckpoint(params: CreateCheckpointParams): Promise<RpgCheckpointId> {
    const { game } = await resolveHost(ctx, params.principal, params.chatId);
    await ctx.claimChat(params.chatId);
    return await ctx.handWrites.run(game.id, async () => {
      const head = await resolveSnapshotForTurn(ctx.db, { id: game.id, chatId: game.chatId });
      if (head === undefined) {
        throw new DomainNotFoundError("snapshot", game.id);
      }
      const id = ctx.ids.checkpoint();
      const now = ctx.now();
      const snapshotId = head.variantId === null ? head.id : ctx.ids.snapshot();
      const snapshotStatements =
        head.variantId === null ? [] : await buildCheckpointSnapshotStatements(ctx.db, head, { id: snapshotId, gameId: game.id, chatId: game.chatId, now });
      await insertCheckpoint(ctx.db, { id, gameId: game.id, snapshotId, label: params.label, trigger: "manual", createdAt: now }, snapshotStatements);
      if (head.variantId !== null) {
        ctx.emitBus({ type: "snapshotPatched", chatId: game.chatId, snapshotId });
      }
      return id;
    });
  }
  return { createCheckpoint };
}
