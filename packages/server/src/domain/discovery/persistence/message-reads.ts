// domain/discovery/persistence/message-reads — the semantic messages projection. discovery reads messages
// only through role/createdAt/characterId — never an economics column (tokens/cost live on
// message_variants and arrive pre-aggregated through the injected stats op).

import type { Db } from "@orb/db";
import { assets, characters, messages, messageVariants } from "@orb/db";
import type { CharacterId, ChatId, MessageId, UserId } from "@orb/kit/ids";
import { aliasedTable, and, desc, eq, gt, sql } from "drizzle-orm";

interface ForgottenGemCandidateRow {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly avatarHash: string | null;
  readonly messageCount: number;
  readonly lastActiveAt: number;
}

export async function readForgottenGemCandidates(db: Db, ownerId: UserId): Promise<ForgottenGemCandidateRow[]> {
  const messageCount = sql<number>`count(${messages.id})`;
  const lastActiveAt = sql<number>`max(${messages.createdAt})`;
  const rows = await db
    .select({
      characterId: characters.id,
      name: characters.name,
      avatarHash: assets.hash,
      messageCount,
      lastActiveAt,
    })
    .from(messages)
    .innerJoin(characters, eq(characters.id, messages.characterId))
    .leftJoin(assets, eq(assets.id, characters.avatarAssetId))
    .where(and(eq(characters.ownerId, ownerId), eq(characters.synthetic, false), eq(messages.role, "assistant")))
    .groupBy(characters.id);
  return rows.map((r) => ({
    characterId: r.characterId,
    name: r.name,
    avatarHash: r.avatarHash,
    messageCount: r.messageCount,
    lastActiveAt: r.lastActiveAt,
  }));
}

interface CharacterMessageSample {
  readonly content: string;
  readonly createdAt: number;
}

/** The character's most-recent PLAYED assistant scenes (the SELECTED variant's content only) — the grounding
 *  corpus `askCard` answers from. Owner-belted via `characters.ownerId` ∩ `characters.id = messages.characterId`
 *  (a foreign character reads zero rows), synthetic excluded. SELECTs `message_variants.content` +
 *  `messages.createdAt` ONLY — NEVER an economics column (tokens/cost live on `message_variants`, stats-private). */
export async function readCharacterMessageSamples(db: Db, ownerId: UserId, characterId: CharacterId, limit: number): Promise<CharacterMessageSample[]> {
  return await db
    .select({ content: messageVariants.content, createdAt: messages.createdAt })
    .from(messages)
    .innerJoin(characters, and(eq(characters.id, messages.characterId), eq(characters.ownerId, ownerId), eq(characters.synthetic, false)))
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(and(eq(messages.characterId, characterId), eq(messages.role, "assistant")))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
}

interface SwipeHotspotRow {
  readonly messageId: MessageId;
  readonly seq: number;
  readonly characterId: CharacterId;
  readonly characterName: string;
  readonly variantCount: number;
  readonly snippet: string | null;
}

/** The chat's assistant slots that were re-rolled — `message_variants` COUNT per message, keeping only slots
 *  with \>1 take, most takes first. Owner-belted via `characters.ownerId` ∩ `characters.id = messages.characterId`
 *  (a foreign chat's messages belong to another owner → zero rows, no leak). `snippet` is the SELECTED variant's
 *  content (SEMANTIC only); the COUNT join + the selected-content join never touch an economics column. */
export async function readSwipeHotspots(db: Db, ownerId: UserId, chatId: ChatId, limit: number): Promise<SwipeHotspotRow[]> {
  const selected = aliasedTable(messageVariants, "selected_variant");
  const variantCount = sql<number>`count(${messageVariants.id})`;
  return await db
    .select({
      messageId: messages.id,
      seq: messages.seq,
      characterId: characters.id,
      characterName: characters.name,
      variantCount,
      snippet: selected.content,
    })
    .from(messages)
    .innerJoin(characters, and(eq(characters.id, messages.characterId), eq(characters.ownerId, ownerId)))
    .innerJoin(messageVariants, eq(messageVariants.messageId, messages.id))
    .leftJoin(selected, eq(selected.id, messages.selectedVariantId))
    .where(and(eq(messages.chatId, chatId), eq(messages.role, "assistant")))
    .groupBy(messages.id)
    .having(gt(variantCount, 1))
    .orderBy(desc(variantCount))
    .limit(limit);
}
