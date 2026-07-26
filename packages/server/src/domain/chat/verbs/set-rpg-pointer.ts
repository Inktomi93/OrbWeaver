// The opaque rpg-pointer WRITE op (rpg-design/05 §3.1): merge the healed `metadata.rpg` `{gameId}` sub-blob so
// the client's takeover gate is a sync read off `ChatDetail` (chat never dereferences it — the truth is
// `rpg_games`). Called ONCE by rpg's `createGame`, inside the same logical commit as the game row. STANDALONE +
// principal-free (rpg gated host authority in createGame): the `getMembership`/`postNarratorMessage`
// injected-op precedent — a compose-built factory, not a `ChatService` verb (it takes no principal).
//
// The write MERGES into the sibling sub-blobs (`...metadata`) so the pointer never nukes roomOverrides/group/
// background — the `setChatDocumentVisibility`/`setChatBackground` merge precedent. A missing chat is a no-op
// (createGame FKs a real chat, so this is a racing-delete guard, not a normal path).

import type { ChatRpgPointer } from "@orb/contracts/rpg";
import { chats } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { ChatContext } from "../context";
import type { SetRpgPointer } from "../contract/context";
import { loadChatRow } from "../persistence/queries";

export function createSetRpgPointer(ctx: ChatContext): SetRpgPointer {
  return async (chatId: ChatId, pointer: ChatRpgPointer): Promise<void> => {
    const chat = await loadChatRow(ctx.db, chatId);
    if (chat === undefined) {
      return; // racing delete — nothing to point at
    }
    const nextMetadata = { ...chat.metadata, rpg: pointer };
    await ctx.db.update(chats).set({ metadata: nextMetadata, updatedAt: ctx.now() }).where(eq(chats.id, chatId));
  };
}
