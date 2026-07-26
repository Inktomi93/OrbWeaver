// domain/rpg/verbs/checkpoint/create-checkpoint — createCheckpoint (rpg-design/05 §4.4). Labels the CURRENT
// resolved snapshot. Host-gated. Safe to bookmark the head because a COMMITTED snapshot is never edited in
// place (`editSnapshot` clone-forwards off a committed head), so the labeled state stays frozen.

import { DomainNotFoundError } from "@orb/kit/errors";
import type { RpgCheckpointId } from "@orb/kit/ids";
import type { CreateCheckpointParams } from "../../contract/params";
import type { RpgContext, RpgService } from "../../contract/service";
import { resolveHost } from "../../guard";
import { insertCheckpoint } from "../../persistence/checkpoints";
import { resolveSnapshotForTurn } from "../../persistence/snapshots";

export function createCreateCheckpoint(ctx: RpgContext): Pick<RpgService, "createCheckpoint"> {
  async function createCheckpoint(params: CreateCheckpointParams): Promise<RpgCheckpointId> {
    const { game } = await resolveHost(ctx, params.principal, params.chatId);
    const head = await resolveSnapshotForTurn(ctx.db, { id: game.id, chatId: game.chatId });
    if (head === undefined) {
      throw new DomainNotFoundError("snapshot", game.id);
    }
    const id = ctx.ids.checkpoint();
    await insertCheckpoint(ctx.db, { id, gameId: game.id, snapshotId: head.id, label: params.label, trigger: "manual", createdAt: ctx.now() });
    return id;
  }
  return { createCheckpoint };
}
