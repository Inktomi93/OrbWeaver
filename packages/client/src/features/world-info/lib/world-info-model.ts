// The world-info collection's pure view-model — the collection KIND and the one-string row SCENT.

import type { BookWithUsage } from "@orb/contracts/world-info";

/** The collection KIND — registry key, React key, selection kind axis. ONE home (the definition, the create
 *  and import verbs that select what they just made, and every cross-feature `goToCollection` caller all
 *  read it). Deliberately the SAME string the retired rail section used as its `SectionId`: the two
 *  vocabularies never coexist (R2 removes the section in the commit that adds the collection), and reusing
 *  it means a user's muscle memory and every doc sentence about "worldInfo" still names the same thing. */
export const WORLD_INFO_COLLECTION_ID = "worldInfo";

/** How many entries a book holds, in words. Spelled ONCE so the row and any future readout can never
 *  disagree about the singular. */
function entryCountLabel(entryCount: number): string {
  return entryCount === 1 ? "1 entry" : `${entryCount} entries`;
}

/** A book row's SCENT — "42 entries · attached ×3" (config-rail workspace mock). The two facts a reader
 *  needs before opening a book: how big it is, and whether it is switched on anywhere at all. `unattached`
 *  is spelled as a WORD rather than "attached ×0" because a book that fires nowhere is the actionable
 *  state, not a smaller number. */
export function bookScent(book: BookWithUsage): string {
  const attachment = book.usage.total === 0 ? "unattached" : `attached ×${book.usage.total}`;
  return `${entryCountLabel(book.entryCount)} · ${attachment}`;
}
