// verb: get — the caller's buddy. Unhatched → the deterministic preview body (so the gacha reveal shows
// the creature before hatching); hatched → the full stored view with lazy read-time mood decay (a buddy
// quiet >15min reads as `content`, no poll write). Owner-scoped by `principal.userId` (never reads `users`).

import type { GetBuddyParams } from "../contract/params";
import type { BuddyContext, BuddyService } from "../contract/service";
import { loadBuddy, previewView, rowToView } from "../persistence/queries";
import { decayMood } from "../substrate/mood";

export function createGet(ctx: BuddyContext): BuddyService["get"] {
  return async (params: GetBuddyParams) => {
    const userId = params.principal.userId;
    const row = await loadBuddy(ctx.db, userId);
    if (row === null) {
      return previewView(userId);
    }
    const view = rowToView(row);
    return { ...view, mood: decayMood(view.mood, row.lastReactionAt, ctx.now()) };
  };
}
