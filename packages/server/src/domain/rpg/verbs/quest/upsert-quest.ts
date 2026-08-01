// domain/rpg/verbs/quest/upsert-quest — upsertQuest (rpg-design/05 §4.4). The HAND arm of the quest plane.
// Post-ratification (§2.5), quests live IN the snapshot state (a `quests` array), so a hand quest edit is a
// snapshot edit: it rides the shared `applyHandEdit` (clone-forward-safe write + auto-lock) with a per-quest
// lock path `quests.<id>`. Host-gated (shared plane).

import type { RpgQuest } from "@orb/contracts/rpg";
import { DomainOperationError } from "@orb/kit/errors";
import type { RpgQuestId } from "@orb/kit/ids";
import type { UpsertQuestParams } from "../../contract/params";
import type { RpgContext, RpgService } from "../../contract/service";
import { resolveHost } from "../../guard";
import { applyHandEdit, currentSnapshotState } from "../../snapshot-edit";

export function createUpsertQuest(ctx: RpgContext): Pick<RpgService, "upsertQuest"> {
  async function upsertQuest(params: UpsertQuestParams): Promise<RpgQuestId> {
    const { game } = await resolveHost(ctx, params.principal, params.chatId);
    const state = await currentSnapshotState(ctx, game);

    const questId = params.questId ?? ctx.ids.quest();
    const existing = state.quests.find((q) => q.id === questId);
    // Objectives: a passed objective without an id mints one; an omitted objectives list keeps the existing.
    const objectives = (params.objectives ?? existing?.objectives ?? []).map((o) => ({
      id: o.id ?? ctx.ids.quest(),
      text: o.text,
      completed: o.completed ?? false,
    }));
    const next: RpgQuest = {
      id: questId,
      name: params.name,
      status: params.status ?? existing?.status ?? "active",
      description: params.description ?? existing?.description ?? "",
      objectives,
    };
    const quests = existing ? state.quests.map((q) => (q.id === questId ? next : q)) : [...state.quests, next];

    const written = await applyHandEdit(ctx, game, { quests }, { lock: [`quests.${questId}`] });
    if (!written.ok) {
      // The F1 write-boundary backstop refused. This verb's own patch is schema-shaped, so the only route here
      // is a base snapshot that is already contract-invalid — surface it (no-swallow), never a silent no-op.
      throw new DomainOperationError("rpg_snapshot_state_invalid", written.reason);
    }
    const snapshotId = written.snapshotId;

    // The quest plane rides the snapshot, so a hand quest write is a snapshot write: the whole panel re-resolves
    // (`snapshotPatched`) AND the quests-only surface scopes (`questChanged`) — the two distinct signals (§4.9).
    ctx.emitBus({ type: "snapshotPatched", chatId: params.chatId, snapshotId });
    ctx.emitBus({ type: "questChanged", chatId: params.chatId });
    return questId;
  }
  return { upsertQuest };
}
