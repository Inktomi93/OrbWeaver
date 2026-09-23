// The opaque rpg-pointer WRITE op (docs/plans/rpg/design.md): merge the healed `metadata.rpg` `{gameId}` sub-blob so
// the client's takeover gate is a sync read off `ChatDetail` (chat never dereferences it — the truth is
// `rpg_games`). Called ONCE by rpg's `createGame`, inside the same logical commit as the game row. STANDALONE +
// principal-free (rpg gated host authority in createGame): the `getMembership`/`postNarratorMessage`
// injected-op precedent — a compose-built factory, not a `ChatService` verb (it takes no principal).
//
// The write touches the `$.rpg` JSON PATH ONLY (`persistence/chat-metadata-write.ts`), so the pointer never
// nukes roomOverrides/group/background AND never re-asserts a stale copy of them over a racing host knob
// (#1450 — the in-memory merge this replaced was a lost-update on every sibling). A missing chat is a no-op
// (createGame FKs a real chat, so this is a racing-delete guard, not a normal path).
//
// NULL = DETACH (the dangling-pointer heal §3.3): a `null` pointer DROPS the `metadata.rpg` sub-blob entirely
// (never writes `rpg: null` — the takeover gate reads `metadata.rpg` presence, so the healed chat must look
// byte-identical to a never-a-game chat). Siblings survive a detach for the same reason a set leaves them:
// `json_remove` names one path.

import type { ChatMetadata } from "@orb/contracts/chat";
import type { ChatRpgPointer } from "@orb/contracts/rpg";
import { chats } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { ChatContext } from "../context.ts";
import type { SetRpgPointer } from "../contract/context.ts";
import { CHAT_OP_CODES, ChatOperationError } from "../contract/errors.ts";
import { carriedBackgroundAvailable } from "../persistence/background-write.ts";
import { chatMetadataDropStatement, chatMetadataSetStatement } from "../persistence/chat-metadata-write.ts";
import { loadChatRow } from "../persistence/queries.ts";
import { commitHostFencedWrite } from "../substrate/host-fenced-write.ts";

/** The metadata a DETACH leaves behind — the `rpg` sub-blob stripped so the chat reads byte-identically to a
 *  never-a-game chat (the takeover gate reads PRESENCE, never `rpg === null`). Used only to compute the
 *  background-availability guard; the durable write is a `json_remove` of that one path. */
function dropRpgPointer(metadata: ChatMetadata): ChatMetadata {
  const { rpg: _droppedGamePointer, ...rest } = metadata;
  void _droppedGamePointer;
  return rest;
}

export function createSetRpgPointer(ctx: ChatContext): SetRpgPointer {
  return async (chatId: ChatId, pointer: ChatRpgPointer | null): Promise<void> => {
    const chat = await loadChatRow(ctx.db, chatId);
    if (chat === undefined) {
      return; // racing delete — nothing to point at
    }
    // ONE JSON PATH, NEVER THE WHOLE BLOB (#1450). The old shape read the row, merged `rpg` in memory and
    // wrote the ENTIRE metadata column back, so a host knob written between that read and this write was
    // silently discarded — and a DETACH re-asserted the stale siblings it had read. `chatMetadataSetStatement`
    // / `chatMetadataDropStatement` touch `$.rpg` alone; the guard still reads the effective metadata because
    // the background predicate is about what will be in force after the write.
    const effective: typeof chat.metadata = pointer === null ? dropRpgPointer(chat.metadata) : { ...chat.metadata, rpg: pointer };
    const guard = carriedBackgroundAvailable(ctx.db, effective);
    const now = ctx.now();
    const statement =
      pointer === null
        ? chatMetadataDropStatement(ctx.db, { chatId, key: "rpg", guard, now })
        : chatMetadataSetStatement(ctx.db, { chatId, key: "rpg", value: pointer, guard, now });
    const results = await commitHostFencedWrite(ctx, chatId, [statement]);
    const updated = results[0] as readonly { readonly id: ChatId }[];
    if (updated.length > 0) {
      return;
    }
    const stillExists = await ctx.db.select({ id: chats.id }).from(chats).where(eq(chats.id, chatId)).limit(1);
    if (stillExists.length > 0) {
      throw new ChatOperationError(CHAT_OP_CODES.backgroundUnavailable, `chat ${chatId}: the background asset is no longer available`);
    }
  };
}
