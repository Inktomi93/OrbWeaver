// verb: setReactions — toggle whether the buddy reacts to app events (writes `buddies.reactionsEnabled`;
// the observer reads it — FLAG[PD-64]). A no-op for an unhatched buddy (no row) — returns the
// preview view with the requested flag. Owner-scoped.

import type { SetReactionsParams } from "../contract/params";
import type { BuddyContext, BuddyService } from "../contract/service";
import { loadBuddy, previewView, rowToView, setBuddyFlag } from "../persistence/queries";
import { decayMood } from "../substrate/mood";

export function createSetReactions(ctx: BuddyContext): BuddyService["setReactions"] {
  return async (params: SetReactionsParams) => {
    const userId = params.principal.userId;
    const existing = await loadBuddy(ctx.db, userId);
    if (existing === null) {
      return { ...previewView(userId), reactionsEnabled: params.enabled };
    }
    await setBuddyFlag(ctx.db, userId, { reactionsEnabled: params.enabled }, ctx.now());
    const view = rowToView({ ...existing, reactionsEnabled: params.enabled });
    return { ...view, mood: decayMood(view.mood, existing.lastReactionAt, ctx.now()) };
  };
}
