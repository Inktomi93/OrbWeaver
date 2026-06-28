// verb: clearChat — wipe the caller's buddy-chat transcript. Owner-scoped (FK-keyed by `principal.userId`);
// another user's turns are untouched.

import type { ClearBuddyChatParams } from "../contract/params";
import type { BuddyContext, BuddyService } from "../contract/service";
import { clearTurns } from "../persistence/queries";

export function createClearChat(ctx: BuddyContext): BuddyService["clearChat"] {
  return async (params: ClearBuddyChatParams) => {
    const cleared = await clearTurns(ctx.db, params.principal.userId);
    return { cleared };
  };
}
