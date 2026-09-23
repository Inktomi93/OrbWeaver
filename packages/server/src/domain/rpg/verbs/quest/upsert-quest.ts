// domain/rpg/verbs/quest/upsert-quest — upsertQuest (docs/plans/rpg/design.md). The HAND arm of the quest plane.
// Post-ratification (§2.5), quests live IN the snapshot state (a `quests` array), so a hand quest edit is a
// snapshot edit: it rides the shared `applyHandEdit` (clone-forward-safe write + auto-lock) with a per-quest
// lock path `quests.<id>`. Host-gated (shared plane).

import type { RpgQuest } from "@orb/contracts/rpg";
import { DomainOperationError } from "@orb/kit/errors";
import type { RpgQuestId } from "@orb/kit/ids";
import type { UpsertQuestParams } from "../../contract/params.ts";
import type { RpgContext, RpgService } from "../../contract/service.ts";
import { resolveHost } from "../../guard.ts";
import { writeHandState } from "../../snapshot-edit.ts";

export function createUpsertQuest(ctx: RpgContext): Pick<RpgService, "upsertQuest"> {
  async function upsertQuest(params: UpsertQuestParams): Promise<RpgQuestId> {
    const { game } = await resolveHost(ctx, params.principal, params.chatId);
    const questId = params.questId ?? ctx.ids.quest();
    const written = await writeHandState(ctx, game, (head) => {
      const existing = head.state.quests.find((q) => q.id === questId);
      const objectives =
        params.questId === undefined
          ? (params.objectives ?? []).map((o) => ({ id: ctx.ids.quest(), text: o.text, completed: o.completed ?? false }))
          : (existing?.objectives ?? []);
      const next: RpgQuest = {
        id: questId,
        name: params.name,
        status: params.status ?? existing?.status ?? "active",
        description: params.description ?? existing?.description ?? "",
        objectives,
      };
      const quests = existing ? head.state.quests.map((q) => (q.id === questId ? next : q)) : [...head.state.quests, next];
      return { ok: true, state: { ...head.state, quests }, locks: { lock: [`quests.${questId}`] } };
    });
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
