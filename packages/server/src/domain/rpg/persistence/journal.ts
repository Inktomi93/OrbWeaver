// domain/rpg/persistence/journal — the VARIANT-AWARE archive store (docs/plans/rpg/design.md, ratification #1).
// Model entries stamp their producing `variantId` (CASCADE — a dead swipe's entries vanish); hand entries
// stamp NULL (every-lineage room truth). The READ projects the ACTIVE lineage: an entry renders iff
// `variantId IS NULL` OR its variant is the SELECTED variant of its message — a derive-don't-stamp join
// against `messages.selectedVariantId` (D46), NO materialized visibility bit. A swipe changes what renders
// with ZERO writes (the snapshot plane and this projection both derive from the selected-variant pointer).
//
// No JSON columns here (title/content/type are plain text) — no parse-on-read belt needed.

import type { Db } from "@orb/db";
import { messages, messageVariants, rpgJournal } from "@orb/db";
import type { MessageVariantId, RpgGameId, RpgJournalId } from "@orb/kit/ids";
import { and, desc, eq, exists, isNull, lt, notExists, or } from "drizzle-orm";
import type { NewRpgJournal, RpgJournalRow } from "../contract/service.ts";

/** Insert a journal entry (hand entry: `variantId` NULL; model entry: the committed variant). `id`/`now`
 *  injected. Returns the row. */
export async function insertJournalEntry(db: Db, values: NewRpgJournal): Promise<RpgJournalRow> {
  const rows = await db.insert(rpgJournal).values(values).returning();
  const row = rows[0];
  if (!row) {
    throw new Error("insertJournalEntry: no row returned");
  }
  return row;
}

/** `messages.seq` is 1-based, so a floor at or below this admits every row — the "no clamp in force" sentinel
 *  (chat's `NO_HISTORY_FLOOR`, restated as a bound rather than imported: this is a raw comparison operand). */
const NO_FLOOR = 0;

/** The active-lineage projection (docs/plans/rpg/design.md): entries visible under the current swipe selection —
 *  `variantId IS NULL` (hand/room, every lineage) OR the entry's variant is the SELECTED variant of its
 *  message. Newest-first, paged (limit/offset). The join to `messages` via `message_variants.messageId`
 *  keys the selected-variant check off the live pointer, so a swipe re-projects with no journal writes.
 *
 *  `historyFloorSeq` is the caller's D16 floor, MINTED by chat's clamp resolver and threaded in as data
 *  (#1528) — REQUIRED, so a new caller must decide whose floor it reads at rather than inheriting "unclamped"
 *  from a default. See the floor paragraph in the WHERE below. */
export async function listActiveJournal(
  db: Db,
  gameId: RpgGameId,
  opts: { readonly limit: number; readonly offset?: number; readonly historyFloorSeq: number },
): Promise<readonly RpgJournalRow[]> {
  // The entry's variant is the selected variant of ITS message: EXISTS a variant row whose id = the entry's
  // variantId AND whose message points its `selectedVariantId` back at that same variant.
  const selectedForVariant = db
    .select({ one: messageVariants.id })
    .from(messageVariants)
    .innerJoin(messages, eq(messages.id, messageVariants.messageId))
    .where(and(eq(messageVariants.id, rpgJournal.variantId), eq(messages.selectedVariantId, rpgJournal.variantId)));
  // THE D16 FLOOR, IN THE QUERY (#1528): a model entry is DISTILLED FROM the slot it stamps, so an entry whose
  // source message sits below the caller's floor is pre-join canon one derivation removed. Expressed as NOT
  // EXISTS over the anchor rather than a join, so a HAND entry (`sourceMessageId IS NULL` — no canon anchor,
  // the chat event clamp's own rule for an anchorless payload) rides through, and so the LIMIT counts only
  // rows the caller may actually read (post-filtering a page would silently short-page a clamped member).
  const anchoredBelowFloor = db
    .select({ one: messages.id })
    .from(messages)
    .where(and(eq(messages.id, rpgJournal.sourceMessageId), lt(messages.seq, opts.historyFloorSeq)));
  const rows = await db
    .select()
    .from(rpgJournal)
    .where(
      and(
        eq(rpgJournal.gameId, gameId),
        or(isNull(rpgJournal.variantId), exists(selectedForVariant)),
        ...(opts.historyFloorSeq > NO_FLOOR ? [notExists(anchoredBelowFloor)] : []),
      ),
    )
    .orderBy(desc(rpgJournal.createdAt), desc(rpgJournal.id))
    .limit(opts.limit)
    .offset(opts.offset ?? 0);
  return rows;
}

/** Patch an entry's mutable text columns (the host edit/recovery path — reaches model entries too). SCOPED to
 *  `gameId` — an entry id from another game matches zero rows (the cross-tenant IDOR belt); returns whether a
 *  row was touched so the verb can surface a leak-free not-found. */
export async function updateJournalEntry(
  db: Db,
  gameId: RpgGameId,
  id: RpgJournalId,
  // Per-field `| undefined` (the transport wire patch the W2 verb spreads in): a `.set()` skips undefined keys,
  // and `exactOptionalPropertyTypes` needs the explicit undefined for the zod-optional wire shape to assign.
  patch: { [K in "type" | "title" | "content"]?: NewRpgJournal[K] | undefined },
): Promise<boolean> {
  const rows = await db
    .update(rpgJournal)
    .set(patch)
    .where(and(eq(rpgJournal.id, id), eq(rpgJournal.gameId, gameId)))
    .returning({ id: rpgJournal.id });
  return rows.length > 0;
}

/** Delete a journal entry (host — the lineage-projection-safe recovery path). SCOPED to `gameId` — a foreign
 *  game's entry id matches zero rows. Returns whether a row was deleted (the verb throws a leak-free not-found
 *  on a no-match). */
export async function deleteJournalEntry(db: Db, gameId: RpgGameId, id: RpgJournalId): Promise<boolean> {
  const rows = await db
    .delete(rpgJournal)
    .where(and(eq(rpgJournal.id, id), eq(rpgJournal.gameId, gameId)))
    .returning({ id: rpgJournal.id });
  return rows.length > 0;
}

/** All entries stamped with a variant (test/introspection helper — the CASCADE probe reads this).
 *
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function listJournalByVariant(db: Db, variantId: MessageVariantId): Promise<RpgJournalRow[]> {
  return db.select().from(rpgJournal).where(eq(rpgJournal.variantId, variantId));
}

/** EVERY journal row for a game — both hand entries (`variantId` NULL) and model entries — NOT lineage-projected.
 *  The fork-clone source read (§3.2): the clone copies hand entries verbatim (room truth on every lineage) and
 *  re-keys model entries through the fork's `variantIdMap`, dropping any whose variant wasn't copied. */
export function listAllJournal(db: Db, gameId: RpgGameId): Promise<RpgJournalRow[]> {
  return db.select().from(rpgJournal).where(eq(rpgJournal.gameId, gameId));
}
