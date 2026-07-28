// The opaque rpg-pointer WRITE op (rpg-design/05 §3.1): merge the healed `metadata.rpg` `{gameId}` sub-blob so
// the client's takeover gate is a sync read off `ChatDetail` (chat never dereferences it — the truth is
// `rpg_games`). Called ONCE by rpg's `createGame`, inside the same logical commit as the game row. STANDALONE +
// principal-free (rpg gated host authority in createGame): the `getMembership`/`postNarratorMessage`
// injected-op precedent — a compose-built factory, not a `ChatService` verb (it takes no principal).
//
// The write MERGES into the sibling sub-blobs (`...metadata`) so the pointer never nukes roomOverrides/group/
// background — the `setChatDocumentVisibility`/`setChatBackground` merge precedent. A missing chat is a no-op
// (createGame FKs a real chat, so this is a racing-delete guard, not a normal path).
//
// NULL = DETACH (the dangling-pointer heal §3.3): a `null` pointer DROPS the `metadata.rpg` sub-blob entirely
// (never writes `rpg: null` — the takeover gate reads `metadata.rpg` presence, so the healed chat must look
// byte-identical to a never-a-game chat). The sibling sub-blobs are preserved (the same merge that guards a
// normal write).

import type { ChatRpgPointer } from "@orb/contracts/rpg";
import { chats } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { ChatContext } from "../context";
import type { SetRpgPointer } from "../contract/context";
import { loadChatRow } from "../persistence/queries";

export function createSetRpgPointer(ctx: ChatContext): SetRpgPointer {
  return async (chatId: ChatId, pointer: ChatRpgPointer | null): Promise<void> => {
    const chat = await loadChatRow(ctx.db, chatId);
    if (chat === undefined) {
      return; // racing delete — nothing to point at
    }
    let nextMetadata: typeof chat.metadata;
    if (pointer === null) {
      // Detach: strip the `rpg` sub-blob so the chat is byte-identical to a never-a-game chat (the gate reads
      // presence, not `rpg === null`). The `rpg` binding names the dropped field; the rest is the kept metadata.
      const { rpg: _droppedGamePointer, ...rest } = chat.metadata;
      void _droppedGamePointer;
      nextMetadata = rest;
    } else {
      nextMetadata = { ...chat.metadata, rpg: pointer };
    }
    await ctx.db.update(chats).set({ metadata: nextMetadata, updatedAt: ctx.now() }).where(eq(chats.id, chatId));
  };
}
