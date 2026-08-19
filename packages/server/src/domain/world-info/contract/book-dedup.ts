// domain/world-info/contract/book-dedup — types for the embedded-book content-dedup planner (the book twin
// of regex/contract/dedup). The planner is PURE (substrate/book-dedup); these are the shapes it reads.

import type { EntryMetadata } from "@orb/contracts/world-info";
import type { WorldBookId } from "@orb/kit/ids";

/** One lore entry, reduced to the fields that decide book IDENTITY (the write-time stamps/ids are dropped).
 *  Both an incoming `BulkImportLoreEntryInput` and a stored `world_entries` row normalize to this. `keys` is
 *  the NULL-vs-[] axis the writer collapses (empty ⇒ null); `metadata` is the SCHEMA-PARSED blob on both
 *  sides (the writer stores `entryMetadataSchema.parse(raw)`, so the incoming side parses too — otherwise a
 *  re-encoded identical book would miss). */
export interface DedupLoreEntry {
  readonly title: string;
  readonly description: string | null;
  readonly content: string;
  readonly keys: readonly string[] | null;
  readonly enabled: boolean;
  readonly priority: number;
  readonly ignoreBudget: boolean;
  readonly metadata: EntryMetadata | null;
}

/** A book reduced to its CONTENT identity: name + its entries (order-independent — see `bookContentKey`). */
export interface DedupBook {
  readonly name: string;
  readonly entries: readonly DedupLoreEntry[];
}

/** An owned library book the incoming embedded book is content-matched against. */
export interface DedupCandidateBook extends DedupBook {
  readonly id: WorldBookId;
}
