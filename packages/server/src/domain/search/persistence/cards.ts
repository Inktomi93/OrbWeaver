// domain/search/persistence/cards — the lexical-engine card-field read (PD-37). Loads the owner's
// character CARD text fields (the BM25 index corpus for `fields`/`suggest`). Queries ONLY; no business
// logic — `substrate/field-index.ts` builds + caches the MiniSearch index over these rows.
//
// OWNER-SCOPED in the WHERE (`characters.ownerId = ?`, D20 — the producer row carries the owner). This is
// a plain owned-table read (no vector, no `vector_distance_cos`); the lexical engine is the retrieval
// surface's second, complementary index over the SAME owned cards. NEVER reads the `users` table.

import type { ReadOnlyDb } from "@orb/db";
import { characters } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";

/** One card's searchable text fields for the BM25 index. The row shape is inferred by the substrate's
 *  `CardDoc` (structural) — kept file-local + un-exported (`no-inline-types`; the verb passes the loader). */
interface CardFieldsRow {
  readonly id: CharacterId;
  readonly name: string;
  readonly description: string | null;
  readonly personality: string | null;
  readonly scenario: string | null;
  readonly creatorNotes: string | null;
}

/** Load the owner's character card text fields — the lexical index corpus. Archived cards are INCLUDED (a
 *  browse-search over "all my characters" should still surface an archived card by name/lore). */
export function loadCardFields(db: ReadOnlyDb, ownerId: UserId): Promise<CardFieldsRow[]> {
  return db
    .select({
      id: characters.id,
      name: characters.name,
      description: characters.description,
      personality: characters.personality,
      scenario: characters.scenario,
      creatorNotes: characters.creatorNotes,
    })
    .from(characters)
    .where(eq(characters.ownerId, ownerId));
}
