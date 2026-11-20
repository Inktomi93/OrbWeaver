// domain/rpg/verbs/quest/delete-quest — deleteQuest (D58). Removes a quest from the current
// resolved snapshot's array and CLEARS its `quests.<id>` lock (the symmetric grammar — a removed element
// leaves no ghost lock). Host-gated. An op-shaped write: the removal derives from the head INSIDE
// `writeHandState`'s resolve, so a state-round flush that landed after any earlier read is the list it
// removes from, never a stale copy it overwrites.

import { DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import { RPG_OP_CODES } from "#src/domain/rpg/contract/op-codes.ts";
import type { DeleteQuestParams } from "#src/domain/rpg/contract/params.ts";
import type { RpgContext, RpgService } from "#src/domain/rpg/contract/service.ts";
import { resolveHost } from "#src/domain/rpg/guard.ts";
import { writeHandState } from "#src/domain/rpg/snapshot-edit.ts";

const QUEST_NOT_FOUND = "quest not found";

export function createDeleteQuest(ctx: RpgContext): Pick<RpgService, "deleteQuest"> {
  async function deleteQuest(params: DeleteQuestParams): Promise<void> {
    const { game, admission } = await resolveHost(ctx, params.principal, params.chatId);
    const written = await writeHandState(ctx, { game, admission }, (head) => {
      if (!head.state.quests.some((q) => q.id === params.questId)) {
        return { ok: false, reason: QUEST_NOT_FOUND };
      }
      const quests = head.state.quests.filter((q) => q.id !== params.questId);
      return { ok: true, state: { ...head.state, quests }, locks: { clear: [`quests.${params.questId}`] } };
    });
    if (!written.ok) {
      if (written.reason === QUEST_NOT_FOUND) {
        throw new DomainNotFoundError("quest", params.questId);
      }
      // The F1 write-boundary backstop refused — a removal cannot invalidate a valid base, so the base itself
      // is already contract-invalid. Surface it (no-swallow), never a silent no-op.
      throw new DomainOperationError(RPG_OP_CODES.snapshotStateInvalid, written.reason);
    }

    // A quest removal is a snapshot write: the panel re-resolves + the quests surface scopes (§4.9).
    ctx.emitBus({ type: "snapshotPatched", chatId: params.chatId, snapshotId: written.snapshotId });
    ctx.emitBus({ type: "questChanged", chatId: params.chatId });
  }
  return { deleteQuest };
}
