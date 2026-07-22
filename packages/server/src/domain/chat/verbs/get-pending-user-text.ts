// The pending-user-text read op (rpg-design/05 §6 #dice-feed-forward): the text of the latest user-role message
// the AI GM turn is responding to. Homed in chat because messages have ONE loader here (the canon read
// chokepoint); a STANDALONE compose-built factory (not a `ChatService` verb: it takes no principal — rpg gates
// the game turn's authority before its `skill_check` re-reads the roll), the `createGetMembership` precedent.
// `null` = no user message yet; the check then rolls normally (no queued die to feed).

import type { ChatContext } from "../context";
import type { GetPendingUserText } from "../contract/context";
import { loadPendingUserText } from "../persistence/queries";

export function createGetPendingUserText(ctx: ChatContext): GetPendingUserText {
  return (chatId) => loadPendingUserText(ctx.db, chatId);
}
