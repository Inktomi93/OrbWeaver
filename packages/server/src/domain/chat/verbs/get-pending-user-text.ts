// The latest user-role message's text, read by the rpg gather for a turn that carries no text of its own (D58).
// Homed in chat because messages have ONE loader here. A STANDALONE compose-built factory, not a `ChatService`
// verb: it takes no principal because chat gated the turn, the `createGetMembership` precedent.

import type { GetPendingUserText } from "@orb/contracts/chat";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { ChatContext } from "../contract/context.ts";
import { loadPendingUserText } from "../persistence/queries.ts";

export function createGetPendingUserText(input: DbAssemblyInput<Pick<ChatContext, "db">>): GetPendingUserText {
  const ctx = { db: databaseForOwner(input.db) };
  return (chatId) => loadPendingUserText(ctx.db, chatId);
}
