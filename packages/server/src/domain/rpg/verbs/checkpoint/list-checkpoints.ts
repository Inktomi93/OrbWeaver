// domain/rpg/verbs/checkpoint/list-checkpoints — listCheckpoints (docs/plans/rpg/design.md). The game's labeled
// bookmarks. Member-gated.
//
// `label` is FREE TEXT (host-authored, or auto-composed from the scene at a trigger), so it carries the same
// hidden-span belt as the two sibling member reads (#1528) — the member→host fork strips checkpoint labels for
// exactly this reason, and until now the source read served them whole.

import type { ListCheckpointsParams } from "../../contract/params.ts";
import type { RpgCheckpointRow, RpgContext, RpgService } from "../../contract/service.ts";
import { resolveMember } from "../../guard.ts";
import { listCheckpoints as listCheckpointRows } from "../../persistence/checkpoints.ts";
import { stripHiddenForViewer } from "../../substrate/hidden-spans.ts";

export function createListCheckpoints(ctx: RpgContext): Pick<RpgService, "listCheckpoints"> {
  async function listCheckpoints(params: ListCheckpointsParams): Promise<readonly RpgCheckpointRow[]> {
    const { game } = await resolveMember(ctx, params.principal, params.chatId);
    const [rows, visibility] = await Promise.all([listCheckpointRows(ctx.db, game.id), ctx.resolveViewerVisibility(params.chatId, params.principal.userId)]);
    return stripHiddenForViewer(rows, visibility?.readsHidden ?? false);
  }
  return { listCheckpoints };
}
