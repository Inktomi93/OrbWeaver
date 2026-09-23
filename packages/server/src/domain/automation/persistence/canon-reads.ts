// domain/automation/persistence/canon-reads — the NARROW, sanctioned schema-level reads of OTHER domains'
// rows the rule verbs need (the agents canon-reads / buddy observer db-reads precedent). NOT cross-feature
// service calls: a bare membership select (the authority gate feeds the role to `can()`), a chat_books
// attachment probe (the `insert_world_info_entry` arm's consent check), and a message count for
// the CEL `chat` projection. Reads only; automation never mutates another domain's canon here.

import type { ParticipantRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { assets, characters, chatBooks, chatParticipants, chats, messages, messageVariants, personas, rpgGames, worldBooks, worldEntries } from "@orb/db";
import type { AssetId, CharacterId, ChatId, PersonaId, UserId, WorldBookId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, asc, desc, eq, gt, isNull, lte, sql } from "drizzle-orm";
import type { AnalysisAuditTarget, AnalysisWindowRow } from "../contract/analysis.ts";
import type { DomainRowKind } from "../contract/ops.ts";

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
 *  (one arm per {@link DomainRowKind}). A forged / stale id names no row ⇒ `false` (fail-closed by
 *  construction — the re-read IS the gate). `ownerId` is the D18/D23 scope anchor; the id arrives UNBRANDED
 *  (the TriggerFact wire shape) and is re-branded here only to query — a re-read gate, never a trust transfer.
 *  The drizzle table stays module-private (the caller names a KIND, not a schema object).
 *
 *  Consumed by the plugin fan-out's visibility gate (`substrate/plugin-subscribers::canInstallerSeeFact`). The
 *  CHAT arm of that gate is deliberately NOT here: a chat verdict is chat's `resolveViewerVisibility` op
 *  (membership AND floor as one answer), never a membership select this domain re-derives. */
export async function isDomainRowOwnedBy(db: Db, kind: DomainRowKind, id: string, userId: UserId): Promise<boolean> {
  const ownerId = await selectDomainRowOwner(db, kind, id);
  return ownerId === userId;
}

/** The owner of one referenced domain row, or `undefined` when no such row exists. Split out so
 *  {@link isDomainRowOwnedBy} stays a one-line predicate and the per-kind SQL stays exhaustive — the
 *  `default: never` arm is the pin, so a fifth {@link DomainRowKind} cannot be added without its read. */
async function selectDomainRowOwner(db: Db, kind: DomainRowKind, id: string): Promise<UserId | undefined> {
  switch (kind) {
    case "character": {
      // @orb-waive owner-scoped-reads(characters): this IS the POST-FETCH ownership arm, not a missing predicate. Every read here PROJECTS `ownerId` and nothing else, and its two callers compare it to a known user — `isDomainRowOwnedBy` (the plugin fan-out's visibility gate) and `isBookOwnedBy` (the owner-global lore gate) — so a foreign row can only ever produce `false`, never a leaked row. Putting the owner in the WHERE instead would make the function unable to answer the question it exists for ("WHO owns this?"), and both callers would still have to compare. The ids arrive UNBRANDED off the wire-shaped `TriggerFact` and are re-branded only to query: the re-read IS the gate. ENDS the day a caller wants the ROW rather than the owner id.
      const rows = await db
        .select({ ownerId: characters.ownerId })
        .from(characters)
        .where(eq(characters.id, castId<CharacterId>(id)))
        .limit(LIMIT_ONE);
      return rows[0]?.ownerId;
    }
    case "asset": {
      // @orb-waive owner-scoped-reads(assets): this IS the POST-FETCH ownership arm, not a missing predicate. Every read here PROJECTS `ownerId` and nothing else, and its two callers compare it to a known user — `isDomainRowOwnedBy` (the plugin fan-out's visibility gate) and `isBookOwnedBy` (the owner-global lore gate) — so a foreign row can only ever produce `false`, never a leaked row. Putting the owner in the WHERE instead would make the function unable to answer the question it exists for ("WHO owns this?"), and both callers would still have to compare. The ids arrive UNBRANDED off the wire-shaped `TriggerFact` and are re-branded only to query: the re-read IS the gate. ENDS the day a caller wants the ROW rather than the owner id.
      const rows = await db
        .select({ ownerId: assets.ownerId })
        .from(assets)
        .where(eq(assets.id, castId<AssetId>(id)))
        .limit(LIMIT_ONE);
      return rows[0]?.ownerId;
    }
    case "persona": {
      // @orb-waive owner-scoped-reads(personas): this IS the POST-FETCH ownership arm, not a missing predicate. Every read here PROJECTS `ownerId` and nothing else, and its two callers compare it to a known user — `isDomainRowOwnedBy` (the plugin fan-out's visibility gate) and `isBookOwnedBy` (the owner-global lore gate) — so a foreign row can only ever produce `false`, never a leaked row. Putting the owner in the WHERE instead would make the function unable to answer the question it exists for ("WHO owns this?"), and both callers would still have to compare. The ids arrive UNBRANDED off the wire-shaped `TriggerFact` and are re-branded only to query: the re-read IS the gate. ENDS the day a caller wants the ROW rather than the owner id.
      const rows = await db
        .select({ ownerId: personas.ownerId })
        .from(personas)
        .where(eq(personas.id, castId<PersonaId>(id)))
        .limit(LIMIT_ONE);
      return rows[0]?.ownerId;
    }
    case "worldBook": {
      // @orb-waive owner-scoped-reads(worldBooks): this IS the POST-FETCH ownership arm, not a missing predicate. Every read here PROJECTS `ownerId` and nothing else, and its two callers compare it to a known user — `isDomainRowOwnedBy` (the plugin fan-out's visibility gate) and `isBookOwnedBy` (the owner-global lore gate) — so a foreign row can only ever produce `false`, never a leaked row. Putting the owner in the WHERE instead would make the function unable to answer the question it exists for ("WHO owns this?"), and both callers would still have to compare. The ids arrive UNBRANDED off the wire-shaped `TriggerFact` and are re-branded only to query: the re-read IS the gate. ENDS the day a caller wants the ROW rather than the owner id.
      const rows = await db
        .select({ ownerId: worldBooks.ownerId })
        .from(worldBooks)
        .where(eq(worldBooks.id, castId<WorldBookId>(id)))
        .limit(LIMIT_ONE);
      return rows[0]?.ownerId;
    }
    default: {
      const exhaustive: never = kind;
      throw new Error(`unhandled automation domain-row kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** C5 — is `bookId` a book THIS user owns? The owner-GLOBAL arm of the `insert_world_info_entry` consent gate
 *  (the RULED book-ownership call).
 *
 *  IT IS A DIFFERENT CONSENT QUESTION FROM {@link isBookAttachedToChat}, not a weaker one. A room-fired lore
 *  write asks the ROOM's consent, and the attachment IS that consent (`engine/arm-executors.ts`'s own note).
 *  A global rule has no room to consent, so the write is a LIBRARY write into the author's own book —
 *  `world_books.ownerId` is KEPT top-level single ownership (D23), and ownership IS that consent. No room
 *  inherits the content unless that room's own scope junction says so, and the junctions are untouched by
 *  this path, so the two gates bound different things and neither substitutes for the other. */
export async function isBookOwnedBy(db: Db, bookId: WorldBookId, userId: UserId): Promise<boolean> {
  return (await selectDomainRowOwner(db, "worldBook", bookId)) === userId;
}

// C5 — "is this author still an ENABLED account?" is DELIBERATELY NOT HERE. It was, briefly, and the
// `no-direct-users-read` gate was right to refuse it: the `users` table is read and written by
// `domain/sessions` + `domain/admin` ONLY (Spine-Identity-and-Auth.md), and every other domain takes what it
// needs about a user from the resolved Principal or an injected op. So the owner-global lane's standing read
// crosses as `IsAuthorEnabled` (`contract/ops.ts`), wired at compose to sessions' own `loadUserById`. The
// note stays because the read is an obvious one to re-add here, and the reason it may not live here is a
// spine rule rather than anything visible in this file.

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

/** Read one analysis window, oldest-first. `afterSeq`/`throughSeq` bound the span (both optional).
 *
 *  `slice` picks WHICH end of an over-long span the `limit` keeps, and the two arms exist because the two
 *  callers are asking different questions (#1416):
 *   • `"newest"` (the default, and the FRESH tip's only sensible reading) walks newest-first and re-reverses
 *     — the legacy slice posture: a COLD start over a long chat reads what is freshest, and the pass's
 *     watermark still advances over the whole span. That ruling stands; see `analysis-arm::readPassInputs`.
 *   • `"earliest"` walks oldest-first — the SETTLED span's warm reading. A cursored pass that took the newest
 *     N of a bounded span and then advanced its watermark to the span END skipped every older row PERMANENTLY
 *     (no later pass can reach behind the mark). Ascending + advancing only to the last row actually returned
 *     makes the cursor a cursor: each pass consumes a prefix and the next one resumes exactly where it stopped. */
export async function listAnalysisWindow(
  db: Db,
  chatId: ChatId,
  opts: { readonly afterSeq?: number; readonly throughSeq?: number; readonly limit: number; readonly slice?: "newest" | "earliest" },
): Promise<AnalysisWindowRow[]> {
  const bounds = [
    eq(messages.chatId, chatId),
    ...(opts.afterSeq !== undefined ? [gt(messages.seq, opts.afterSeq)] : []),
    ...(opts.throughSeq !== undefined ? [lte(messages.seq, opts.throughSeq)] : []),
  ];
  const earliest = opts.slice === "earliest";
  const rows = await db
    .select({ seq: messages.seq, role: messages.role, speaker: characters.name, content: messageVariants.content })
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .leftJoin(characters, eq(characters.id, messages.characterId))
    .where(and(...bounds))
    .orderBy(earliest ? asc(messages.seq) : desc(messages.seq))
    .limit(opts.limit);
  return earliest ? rows : rows.reverse();
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

/** C3 — the newest AUDITABLE reply: the highest-seq assistant slot joined to its SELECTED variant, with
 *  hidden slots excluded. `null` = the room has no assistant reply to audit (a fresh chat, or one whose only
 *  replies are held out of assembly) — not an error, just nothing to do this pass.
 *
 *  THE THREE PREDICATES ARE EACH LOAD-BEARING, not defensive padding:
 *   • `role = 'assistant'` — the audit is of MODEL prose. A human's own message is theirs to write badly.
 *   • the selected-variant join — the same visibility predicate every other read here uses (D26): the audit
 *     must read the swipe the room is actually looking at, or the card would quote text nobody can see.
 *   • `excludedFromPrompt = false` — a hidden row is one the host has already held out of the story; offering
 *     to rewrite it is offering to fix something they deliberately shelved. */
export async function latestAuditableReply(db: Db, chatId: ChatId): Promise<AnalysisAuditTarget | null> {
  const rows = await db
    .select({ messageId: messages.id, variantId: messageVariants.id, content: messageVariants.content })
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(and(eq(messages.chatId, chatId), eq(messages.role, "assistant"), eq(messages.excludedFromPrompt, false)))
    .orderBy(desc(messages.seq))
    .limit(LIMIT_ONE);
  return rows[0] ?? null;
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
