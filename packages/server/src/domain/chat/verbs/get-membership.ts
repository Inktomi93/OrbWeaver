// The narrow membership-read op (docs/plans/rpg/design.md), homed in chat because membership has ONE loader here
// (`chat_participants` — the `no-direct-users-read`/membership chokepoint). A STANDALONE compose-built factory
// (not a `ChatService` verb: it takes no principal — rpg gates game authority around it, feeding the result to
// `can()`); the `createExtractQuiet` precedent. `null` = not a present member OR no such chat (one leak-free
// answer — the not-a-participant 404 rpg surfaces).

import type { ChatContext } from "../context.ts";
import type { GetMembership } from "../contract/context.ts";
import { loadPresentRole } from "../persistence/participants-read.ts";

export function createGetMembership(ctx: ChatContext): GetMembership {
  return async (chatId, userId) => {
    const role = await loadPresentRole(ctx.db, chatId, userId);
    return role === null ? null : { role };
  };
}
