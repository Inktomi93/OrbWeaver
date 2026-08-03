// domain/rpg/verbs/checkpoint/list-checkpoints — listCheckpoints (rpg-design/05 §4.4). The game's labeled
// bookmarks. Member-gated.

import type { ListCheckpointsParams } from "../../contract/params.ts";
import type { RpgCheckpointRow, RpgContext, RpgService } from "../../contract/service.ts";
import { resolveMember } from "../../guard.ts";
import { listCheckpoints as listCheckpointRows } from "../../persistence/checkpoints.ts";

export function createListCheckpoints(ctx: RpgContext): Pick<RpgService, "listCheckpoints"> {
  async function listCheckpoints(params: ListCheckpointsParams): Promise<readonly RpgCheckpointRow[]> {
    const { game } = await resolveMember(ctx, params.principal, params.chatId);
    return await listCheckpointRows(ctx.db, game.id);
  }
  return { listCheckpoints };
}
