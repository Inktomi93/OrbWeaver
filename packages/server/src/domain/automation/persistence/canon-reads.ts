// domain/automation/persistence/canon-reads — the NARROW, sanctioned schema-level reads of OTHER domains'
// rows the rule verbs need (the crew canon-reads / buddy observer db-reads precedent). NOT cross-feature
// service calls: a bare membership select (the authority gate feeds the role to `can()`), a chat_books
// attachment probe (the `insert_world_info_entry` arm's consent check — 03 §1.3), and a message count for
// the CEL `chat` projection (02 §1). Reads only; automation never mutates another domain's canon here.

import type { TriggerFact } from "@orb/contracts/automation";
import type { ParticipantRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { assets, characters, chatBooks, chatParticipants, chats, messages, worldEntries } from "@orb/db";
import type { AssetId, CharacterId, ChatId, UserId, WorldBookId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq, isNull, sql } from "drizzle-orm";

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
 *  consent (03 §1.3). */
export async function isBookAttachedToChat(db: Db, chatId: ChatId, bookId: WorldBookId): Promise<boolean> {
  const rows = await db
    .select({ bookId: chatBooks.worldBookId })
    .from(chatBooks)
    .where(and(eq(chatBooks.chatId, chatId), eq(chatBooks.worldBookId, bookId)))
    .limit(LIMIT_ONE);
  return rows.length > 0;
}

/** The chat's message count — the CEL `chat.messageCount` projection (02 §1). A narrow COUNT, not a row read. */
export async function countChatMessages(db: Db, chatId: ChatId): Promise<number> {
  const rows = await db.select({ count: sql<number>`count(*)` }).from(messages).where(eq(messages.chatId, chatId));
  return rows[0]?.count ?? 0;
}

/** The PRESENT HUMAN members of a chat (`leftSeq IS NULL`, `kind='human'`) — the `post_notification` arm's
 *  `all_members` recipient set (03 §1.5; recipients must be chat participants). Agent seats have no inbox. */
export async function loadPresentHumanMemberIds(db: Db, chatId: ChatId): Promise<UserId[]> {
  const rows = await db
    .select({ userId: chatParticipants.userId })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.kind, "human"), isNull(chatParticipants.leftSeq)));
  // `userId` is column-nullable (some seat kinds carry none); a present HUMAN seat always has one — filter
  // the nulls out for the type + defensively.
  return rows.flatMap((row) => (row.userId === null ? [] : [row.userId]));
}

/** Whether the installing user OWNS a row by id — the chat-less domain-fact visibility check (character.updated
 *  / asset.created). A forged / stale id names no row ⇒ `false` (fail-closed by construction — the re-read IS the
 *  gate). `ownerId` is the D18/D23 scope anchor. */
async function isRowOwnedBy(db: Db, table: typeof characters | typeof assets, id: string, userId: UserId): Promise<boolean> {
  const rows = await db
    .select({ ownerId: table.ownerId })
    .from(table)
    .where(eq(table.id, table === characters ? castId<CharacterId>(id) : castId<AssetId>(id)))
    .limit(LIMIT_ONE);
  return rows[0]?.ownerId === userId;
}

/** The plugin fan-out's leak-free VISIBILITY gate (plugin-design/04 §P4): may `installer` SEE this fact? A
 *  chat-scoped fact requires PRESENT membership in its chat (the D18 predicate — a stranger installer gets
 *  zero deliveries for a chat it cannot read). A chat-less DOMAIN fact (character.updated / asset.created)
 *  requires OWNERSHIP of the referenced resource. Any other chat-less fact fails CLOSED. Fail-closed
 *  everywhere: a garbage/forged id in the (untrusted-marshalled) fact simply resolves to no row / no role.
 *  Ids arrive UNBRANDED (the TriggerFact wire shape) and are re-branded here only to query — a re-read gate,
 *  never a trust transfer. */
export async function canInstallerSeeFact(db: Db, installer: UserId, fact: TriggerFact): Promise<boolean> {
  if (fact.chatId !== null) {
    return (await loadCallerRole(db, castId<ChatId>(fact.chatId), installer)) !== undefined;
  }
  if (fact.characterId !== undefined) {
    return isRowOwnedBy(db, characters, fact.characterId, installer);
  }
  if (fact.assetId !== undefined) {
    return isRowOwnedBy(db, assets, fact.assetId, installer);
  }
  return false;
}

/** The titles of the entries a rule OWNS in a book (its `insert_world_info_entry` arm namespaces every entry
 *  title by the ruleId — see `engine/arm-executors`), for the per-rule ≤64-entries-per-book cap (03 §1.3).
 *  A JS-side `startsWith` filter — NOT SQL `LIKE` (the ruleId's TypeID underscores are `LIKE` wildcards that
 *  would over-match a sibling rule's entries); a book's entry set is small, so the title read is cheap. */
export async function listRuleEntryTitles(db: Db, bookId: WorldBookId, titlePrefix: string): Promise<string[]> {
  const rows = await db.select({ title: worldEntries.title }).from(worldEntries).where(eq(worldEntries.worldBookId, bookId));
  return rows.flatMap((row) => (row.title.startsWith(titlePrefix) ? [row.title] : []));
}
