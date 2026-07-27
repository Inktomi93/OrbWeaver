// domain/rpg/persistence/journal — the VARIANT-AWARE archive store (rpg-design/05 §2.5, ratification #1).
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
import { and, desc, eq, exists, isNull, or } from "drizzle-orm";
import type { NewRpgJournal, RpgJournalRow } from "../contract/service";

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

/** The active-lineage projection (rpg-design/05 §2.5): entries visible under the current swipe selection —
 *  `variantId IS NULL` (hand/room, every lineage) OR the entry's variant is the SELECTED variant of its
 *  message. Newest-first, paged (limit/offset). The join to `messages` via `message_variants.messageId`
 *  keys the selected-variant check off the live pointer, so a swipe re-projects with no journal writes. */
export async function listActiveJournal(
  db: Db,
  gameId: RpgGameId,
  opts: { readonly limit: number; readonly offset?: number } = { limit: 50 },
): Promise<readonly RpgJournalRow[]> {
  // The entry's variant is the selected variant of ITS message: EXISTS a variant row whose id = the entry's
  // variantId AND whose message points its `selectedVariantId` back at that same variant.
  const selectedForVariant = db
    .select({ one: messageVariants.id })
    .from(messageVariants)
    .innerJoin(messages, eq(messages.id, messageVariants.messageId))
    .where(and(eq(messageVariants.id, rpgJournal.variantId), eq(messages.selectedVariantId, rpgJournal.variantId)));
  const rows = await db
    .select()
    .from(rpgJournal)
    .where(and(eq(rpgJournal.gameId, gameId), or(isNull(rpgJournal.variantId), exists(selectedForVariant))))
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

/** All entries stamped with a variant (test/introspection helper — the CASCADE probe reads this). */
export function listJournalByVariant(db: Db, variantId: MessageVariantId): Promise<RpgJournalRow[]> {
  return db.select().from(rpgJournal).where(eq(rpgJournal.variantId, variantId));
}
