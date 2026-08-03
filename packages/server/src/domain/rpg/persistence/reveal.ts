// domain/rpg/persistence/reveal — the HOST-REVEAL body read (parity-plus §3.6). Reads the chat's assistant
// transcript on the SELECTED-VARIANT lineage (the same "visible" pointer the snapshot ladder walks) so the
// host-reveal verb can tokenize the stored `<lie>`/`<ofilter>` hidden spans OUT of the bodies. QUERIES ONLY —
// no parse, no authz (the verb host-gates + tokenizes). It reads chat's tables directly, the `readBeat` /
// `findLastAssistantSelectedVariant` precedent (rpg reaches the committed variant content at the persistence
// layer within its own compose). Scoped to the chat by construction (the `messages.chatId` join), so a message
// from another room is unreachable — the cross-tenant belt (D108 carve #1) holds without a re-scope re-query.

import type { Db } from "@orb/db";
import { messages, messageVariants } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { and, asc, eq } from "drizzle-orm";
import type { RevealBodyRow } from "../contract/service.ts";

/** The chat's assistant transcript on the SELECTED-VARIANT lineage, chronological. Joins each assistant slot
 *  to its `selectedVariantId` variant so the reveal reads exactly what the reader saw (a swipe changes the
 *  lineage → the reveal follows it, lineage-consistent by construction). Excludes prompt-hidden slots (they are
 *  not part of the visible transcript). Scoped to `chatId` — a foreign message never joins. */
export async function listSelectedAssistantBodies(db: Db, chatId: ChatId): Promise<readonly RevealBodyRow[]> {
  const rows = await db
    .select({ messageId: messages.id, seq: messages.seq, content: messageVariants.content })
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(and(eq(messages.chatId, chatId), eq(messages.role, "assistant"), eq(messages.excludedFromPrompt, false)))
    .orderBy(asc(messages.seq));
  return rows.map((r) => ({ messageId: r.messageId, seq: r.seq, content: r.content }));
}
