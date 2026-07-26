// domain/rpg/verbs/quest/delete-quest — deleteQuest (rpg-design/05 §4.4). Removes a quest from the current
// resolved snapshot's array and CLEARS its `quests.<id>` lock (the symmetric grammar — a removed element
// leaves no ghost lock). Host-gated.

import { DomainNotFoundError } from "@orb/kit/errors";
import type { DeleteQuestParams } from "../../contract/params";
import type { RpgContext, RpgService } from "../../contract/service";
import { resolveHost } from "../../guard";
import { applyHandEdit, currentSnapshotState } from "../../snapshot-edit";

export function createDeleteQuest(ctx: RpgContext): Pick<RpgService, "deleteQuest"> {
  async function deleteQuest(params: DeleteQuestParams): Promise<void> {
    const { game } = await resolveHost(ctx, params.principal, params.chatId);
    const state = await currentSnapshotState(ctx, game);
    if (!state.quests.some((q) => q.id === params.questId)) {
      throw new DomainNotFoundError("quest", params.questId);
    }
    const quests = state.quests.filter((q) => q.id !== params.questId);
    const snapshotId = await applyHandEdit(ctx, game, { quests }, { clear: [`quests.${params.questId}`] });

    // A quest removal is a snapshot write: the panel re-resolves + the quests surface scopes (§4.9).
    ctx.emitBus({ type: "snapshotPatched", chatId: params.chatId, snapshotId });
    ctx.emitBus({ type: "questChanged", chatId: params.chatId });
  }
  return { deleteQuest };
}
