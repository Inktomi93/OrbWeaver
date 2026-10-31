// Host bookmarks resolve inside hand-write ownership and save the head as a bookmark row, which the state
// ladder never reads, so a checkpoint never moves the room's state. The bookmark and its label share one batch.

import { DomainNotFoundError } from "@orb/kit/errors";
import type { RpgCheckpointId } from "@orb/kit/ids";
import type { CreateCheckpointParams } from "#src/domain/rpg/contract/params.ts";
import type { RpgContext, RpgService } from "#src/domain/rpg/contract/service.ts";
import { resolveHost } from "#src/domain/rpg/guard.ts";
import { insertCheckpoint } from "#src/domain/rpg/persistence/checkpoints.ts";
import { buildBookmarkSnapshotStatement, resolveSnapshotForTurn } from "#src/domain/rpg/persistence/snapshots.ts";

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
      const snapshotId = ctx.ids.snapshot();
      const now = ctx.now();
      await insertCheckpoint(
        ctx.db,
        { id, gameId: game.id, snapshotId, label: params.label, trigger: "manual", createdAt: now },
        buildBookmarkSnapshotStatement(ctx.db, head, { id: snapshotId, gameId: game.id, now }),
      );
      return id;
    });
  }
  return { createCheckpoint };
}
