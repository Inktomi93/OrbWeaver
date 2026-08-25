// domain/automation/persistence/canon-reads — the NARROW, sanctioned schema-level reads of OTHER domains'
// rows the rule verbs need (the agents canon-reads / buddy observer db-reads precedent). NOT cross-feature
// service calls: a bare membership select (the authority gate feeds the role to `can()`), a chat_books
// attachment probe (the `insert_world_info_entry` arm's consent check), and a message count for
// the CEL `chat` projection. Reads only; automation never mutates another domain's canon here.

import type { ParticipantRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { assets, characters, chatBooks, chatParticipants, chats, messages, messageVariants, rpgGames, worldEntries } from "@orb/db";
import type { AssetId, CharacterId, ChatId, UserId, WorldBookId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, desc, eq, gt, isNull, lte, sql } from "drizzle-orm";
import type { AnalysisWindowRow } from "../contract/analysis.ts";

const LIMIT_ONE = 1;

/** The caller's PRESENT membership role in a chat, or `undefined` when the chat is absent OR the caller is
 *  not a present member (`leftSeq IS NULL` — the D18 present-membership predicate). The guard collapses
 *  `undefined` to a leak-free RuleNotFoundError. */
export async function loadCallerRole(db: Db, chatId: ChatId, userId: UserId): Promise<ParticipantRole | undefined> {
  const rows = await db
    .select({ role: chatParticipants.role })
    .from(chats)
    .innerJoin(chatParticipants, and(eq(chatParticipants.chatId, chats.id), eq(chatParticipants.userId, userId), isNull(chatParticipants.leftSeq)))
    .where(eq(chats.id, chatId))
    .limit(LIMIT_ONE);
  return rows[0]?.role;
}

/** Whether a world book is attached DIRECTLY to a chat (the `chat_books` junction). The
 *  `insert_world_info_entry` arm may only write a book the room has consented to — the attachment IS that
 *  consent. */
export async function isBookAttachedToChat(db: Db, chatId: ChatId, bookId: WorldBookId): Promise<boolean> {
  const rows = await db
    .select({ bookId: chatBooks.worldBookId })
    .from(chatBooks)
    .where(and(eq(chatBooks.chatId, chatId), eq(chatBooks.worldBookId, bookId)))
    .limit(LIMIT_ONE);
  return rows.length > 0;
}

/** The chat's message count — the CEL `chat.messageCount` projection. A narrow COUNT, not a row read.
 *  VISIBLE rows only: the selected-variant `innerJoin` is the visibility predicate, the SAME join the chat
 *  list's stats read uses. (D124 retired the second half: rpg's content-less "state anchor" slots — which
 *  made `chat.messageCount > 10` fire early after a host resync — no longer exist to be filtered.) */
export async function countChatMessages(db: Db, chatId: ChatId): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(eq(messages.chatId, chatId));
  return rows[0]?.count ?? 0;
}

/** The PRESENT HUMAN members of a chat (`leftSeq IS NULL`, `kind='human'`) — the `post_notification` arm's
 *  `all_members` recipient set (recipients must be chat participants). Agent seats have no inbox. */
export async function loadPresentHumanMemberIds(db: Db, chatId: ChatId): Promise<UserId[]> {
  const rows = await db
    .select({ userId: chatParticipants.userId })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.kind, "human"), isNull(chatParticipants.leftSeq)));
  // `userId` is column-nullable (some seat kinds carry none); a present HUMAN seat always has one — filter
  // the nulls out for the type + defensively.
  return rows.flatMap((row) => (row.userId === null ? [] : [row.userId]));
}

/** Whether the installing user OWNS the referenced row — the chat-less domain-fact visibility check
 *  (character.updated / asset.created). A forged / stale id names no row ⇒ `false` (fail-closed by
 *  construction — the re-read IS the gate). `ownerId` is the D18/D23 scope anchor; the id arrives UNBRANDED
 *  (the TriggerFact wire shape) and is re-branded here only to query — a re-read gate, never a trust transfer.
 *  The drizzle table stays module-private (the caller names a KIND, not a schema object).
 *
 *  Consumed by the plugin fan-out's visibility gate (`substrate/plugin-subscribers::canInstallerSeeFact`). The
 *  CHAT arm of that gate is deliberately NOT here: a chat verdict is chat's `resolveViewerVisibility` op
 *  (membership AND floor as one answer), never a membership select this domain re-derives. */
export async function isDomainRowOwnedBy(db: Db, kind: "character" | "asset", id: string, userId: UserId): Promise<boolean> {
  if (kind === "character") {
    const rows = await db
      .select({ ownerId: characters.ownerId })
      .from(characters)
      .where(eq(characters.id, castId<CharacterId>(id)))
      .limit(LIMIT_ONE);
    return rows[0]?.ownerId === userId;
  }
  const rows = await db
    .select({ ownerId: assets.ownerId })
    .from(assets)
    .where(eq(assets.id, castId<AssetId>(id)))
    .limit(LIMIT_ONE);
  return rows[0]?.ownerId === userId;
}

/** The titles of the entries a rule OWNS in a book (its `insert_world_info_entry` arm namespaces every entry
 *  title by the ruleId — see `engine/arm-executors`), for the per-rule ≤64-entries-per-book cap.
 *  A JS-side `startsWith` filter — NOT SQL `LIKE` (the ruleId's TypeID underscores are `LIKE` wildcards that
 *  would over-match a sibling rule's entries); a book's entry set is small, so the title read is cheap. */
export async function listRuleEntryTitles(db: Db, bookId: WorldBookId, titlePrefix: string): Promise<string[]> {
  const rows = await db.select({ title: worldEntries.title }).from(worldEntries).where(eq(worldEntries.worldBookId, bookId));
  return rows.flatMap((row) => (row.title.startsWith(titlePrefix) ? [row.title] : []));
}

// ── S5 — the run_analysis read windows + the game fence ────────────────────────────────────────────────
// The row shape is `contract/analysis.ts::AnalysisWindowRow` (the type home); these reads implement it.

/** Read one analysis window, oldest-first. `afterSeq`/`throughSeq` bound the span (both optional); `limit`
 *  keeps the NEWEST rows of the span (the query walks newest-first and the result is re-reversed), which is
 *  the legacy slice posture: a cold start over a long chat reads what is freshest and the watermark still
 *  advances over the whole span. */
export async function listAnalysisWindow(
  db: Db,
  chatId: ChatId,
  opts: { readonly afterSeq?: number; readonly throughSeq?: number; readonly limit: number },
): Promise<AnalysisWindowRow[]> {
  const bounds = [
    eq(messages.chatId, chatId),
    ...(opts.afterSeq !== undefined ? [gt(messages.seq, opts.afterSeq)] : []),
    ...(opts.throughSeq !== undefined ? [lte(messages.seq, opts.throughSeq)] : []),
  ];
  const rows = await db
    .select({ seq: messages.seq, role: messages.role, speaker: characters.name, content: messageVariants.content })
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .leftJoin(characters, eq(characters.id, messages.characterId))
    .where(and(...bounds))
    .orderBy(desc(messages.seq))
    .limit(opts.limit);
  return rows.reverse();
}

/** The chat's newest VISIBLE seq (the settled-span upper bound derives from it: `maxSeq − protectTail`).
 *  `null` = an empty chat (no settled span can exist). */
export async function maxVisibleSeq(db: Db, chatId: ChatId): Promise<number | null> {
  const rows = await db
    .select({ max: sql<number | null>`max(${messages.seq})` })
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(eq(messages.chatId, chatId));
  return rows[0]?.max ?? null;
}

/** Whether the chat has an ACTIVE rpg game — the analysis-arm MINT fence (§3-S5.7: the game owns its own
 *  steering, D109; the legacy no-double-director law). A narrow schema-level read of `rpg_games` (the
 *  sanctioned canon-read posture — this file's header), never an rpg service call. */
export async function hasActiveGame(db: Db, chatId: ChatId): Promise<boolean> {
  const rows = await db
    .select({ id: rpgGames.id })
    .from(rpgGames)
    .where(and(eq(rpgGames.chatId, chatId), eq(rpgGames.status, "active")))
    .limit(LIMIT_ONE);
  return rows.length > 0;
}
