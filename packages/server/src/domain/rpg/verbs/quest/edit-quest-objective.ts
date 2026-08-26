// domain/rpg/verbs/quest/edit-quest-objective — objective-ID operations over the current resolved head.
// The client never sends an objectives array: add/toggle/delete name only the datum they intend to change,
// so a stale panel cannot re-assert every sibling objective it happened to render.

import { DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import type { EditQuestObjectiveParams } from "../../contract/params.ts";
import type { RpgContext, RpgService } from "../../contract/service.ts";
import { resolveHost } from "../../guard.ts";
import { writeHandState } from "../../snapshot-edit.ts";

export function createEditQuestObjective(ctx: RpgContext): Pick<RpgService, "editQuestObjective"> {
  async function editQuestObjective(params: EditQuestObjectiveParams): Promise<void> {
    const { game } = await resolveHost(ctx, params.principal, params.chatId);
    const op = params.op;
    const written = await writeHandState(ctx, game, (head) => {
      const quest = head.state.quests.find((row) => row.id === params.questId);
      if (quest === undefined) {
        return { ok: false, reason: "quest not found" };
      }

      let objectives = quest.objectives;
      if (op.kind === "add") {
        objectives = [...objectives, { id: ctx.ids.quest(), text: op.text, completed: false }];
      } else {
        const exists = objectives.some((objective) => objective.id === op.objectiveId);
        if (!exists) {
          return { ok: false, reason: "quest objective not found" };
        }
        objectives =
          op.kind === "setCompleted"
            ? objectives.map((objective) => (objective.id === op.objectiveId ? { ...objective, completed: op.completed } : objective))
            : objectives.filter((objective) => objective.id !== op.objectiveId);
      }

      const quests = head.state.quests.map((row) => (row.id === params.questId ? { ...row, objectives } : row));
      return { ok: true, state: { ...head.state, quests }, locks: { lock: [`quests.${params.questId}`] } };
    });
    if (!written.ok) {
      if (written.reason === "quest not found") {
        throw new DomainNotFoundError("quest", params.questId);
      }
      if (written.reason === "quest objective not found" && op.kind !== "add") {
        throw new DomainNotFoundError("quest objective", op.objectiveId);
      }
      throw new DomainOperationError("rpg_snapshot_state_invalid", written.reason);
    }
    ctx.emitBus({ type: "snapshotPatched", chatId: params.chatId, snapshotId: written.snapshotId });
    ctx.emitBus({ type: "questChanged", chatId: params.chatId });
  }
  return { editQuestObjective };
}
