// verb: history — the persisted buddy-chat transcript, oldest-first, for hydration on load. Display caps
// at the most recent ~50 turns (the bubble list is short; `ask` slices tighter for memory). Owner-scoped.

import type { BuddyContext } from "../context";
import type { BuddyHistoryParams } from "../contract/params";
import type { BuddyService } from "../contract/service";
import { loadTurns, turnToView } from "../persistence/queries";

const DISPLAY_LIMIT = 50;

export function createHistory(ctx: BuddyContext): BuddyService["history"] {
  return async (params: BuddyHistoryParams) => {
    const rows = await loadTurns(ctx.db, params.principal.userId, DISPLAY_LIMIT);
    return rows.map(turnToView);
  };
}
