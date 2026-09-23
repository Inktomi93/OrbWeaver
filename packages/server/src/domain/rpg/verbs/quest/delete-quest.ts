// domain/rpg/verbs/quest/delete-quest — deleteQuest (docs/plans/rpg/design.md). Removes a quest from the current
// resolved snapshot's array and CLEARS its `quests.<id>` lock (the symmetric grammar — a removed element
// leaves no ghost lock). Host-gated.

import { DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import type { DeleteQuestParams } from "../../contract/params.ts";
import type { RpgContext, RpgService } from "../../contract/service.ts";
import { resolveHost } from "../../guard.ts";
import { applyHandEdit, currentSnapshotState } from "../../snapshot-edit.ts";

export function createDeleteQuest(ctx: RpgContext): Pick<RpgService, "deleteQuest"> {
  async function deleteQuest(params: DeleteQuestParams): Promise<void> {
    const { game } = await resolveHost(ctx, params.principal, params.chatId);
    const state = await currentSnapshotState(ctx, game);
    if (!state.quests.some((q) => q.id === params.questId)) {
      throw new DomainNotFoundError("quest", params.questId);
    }
    const quests = state.quests.filter((q) => q.id !== params.questId);
    const written = await applyHandEdit(ctx, game, { quests }, { clear: [`quests.${params.questId}`] });
    if (!written.ok) {
      // The F1 write-boundary backstop refused — a removal cannot invalidate a valid base, so the base itself
      // is already contract-invalid. Surface it (no-swallow), never a silent no-op.
      throw new DomainOperationError("rpg_snapshot_state_invalid", written.reason);
    }
    const snapshotId = written.snapshotId;

    // A quest removal is a snapshot write: the panel re-resolves + the quests surface scopes (§4.9).
    ctx.emitBus({ type: "snapshotPatched", chatId: params.chatId, snapshotId });
    ctx.emitBus({ type: "questChanged", chatId: params.chatId });
  }
  return { deleteQuest };
}
