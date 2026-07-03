// verb: setAgency — toggle the buddy's "hands": whether it may run tool-using agent turns + execute
// confirmed mutations (writes `buddies.agencyEnabled`). The capability-ceiling kill switch (pairs with
// the propose/confirm gate). A no-op for an unhatched buddy — returns the preview view with the requested flag.
// Owner-scoped.

import type { SetAgencyParams } from "../contract/params";
import type { BuddyContext, BuddyService } from "../contract/service";
import { loadBuddy, previewView, rowToView, setBuddyFlag } from "../persistence/queries";
import { decayMood } from "../substrate/mood";

export function createSetAgency(ctx: BuddyContext): BuddyService["setAgency"] {
  return async (params: SetAgencyParams) => {
    const userId = params.principal.userId;
    const existing = await loadBuddy(ctx.db, userId);
    if (existing === null) {
      return { ...previewView(userId), agencyEnabled: params.enabled };
    }
    await setBuddyFlag(ctx.db, userId, { agencyEnabled: params.enabled }, ctx.now());
    const view = rowToView({ ...existing, agencyEnabled: params.enabled });
    return { ...view, mood: decayMood(view.mood, existing.lastReactionAt, ctx.now()) };
  };
}
