// @orb/contracts/tag — the tag wire axes + create/update inputs + cross-boundary tag/junction views.
// The five targets are per-type FK junctions, not a polymorphic `(type, untyped_id)` table.
// `chat_tags` is a PER-USER overlay: its target has no `ownerId`, so the chat junction carries its own
// `ownerId` (the tagger) — `taggerId` is populated ONLY for `targetType: "chat"`. `status` (pending/
// accepted) is a `character_tags`-only junction column, not a parallel store.

import type { CharacterId, TagId } from "@orb/kit/ids";
import { z } from "zod";

const NAME_MIN_LENGTH = 1;
const NAME_MAX_LENGTH = 200;

/** The five taggable entity types — each backed by its own per-type FK junction table. */
export const TAG_TARGET_TYPES = ["character", "chat", "worldBook", "persona", "preset"] as const;
export const tagTargetTypeSchema = z.enum(TAG_TARGET_TYPES);
export type TagTargetType = z.infer<typeof tagTargetTypeSchema>;

/** Tag provenance (display-only axis). `manual` = user-typed · `auto` = corpus tag-suggest distillation ·
 *  `card` = adopted from a character card's tag field. Not semantic facets — that's `discovery`'s concern. */
export const TAG_SOURCES = ["manual", "auto", "card"] as const;
export const tagSourceSchema = z.enum(TAG_SOURCES);
export type TagSource = z.infer<typeof tagSourceSchema>;

/** ST's tags-as-folders state. `NONE` = plain tag · `OPEN` = folder, members stay in the main list ·
 *  `CLOSED` = folder, members hidden until entered. */
export const TAG_FOLDER_TYPES = ["NONE", "OPEN", "CLOSED"] as const;
// DECLARED off the tuple to keep the vocabulary's type face at its one home. Biome 2.5.1 now follows this
// `z.infer` correctly through exhaustive switches, so compiler reachability no longer requires the split.
// `satisfies` is only a one-way assignability check; the output-twin gate proves exact parity.
export type TagFolderType = (typeof TAG_FOLDER_TYPES)[number];
export const tagFolderTypeSchema = z.enum(TAG_FOLDER_TYPES) satisfies z.ZodType<TagFolderType>;

/** The proposed/accepted surface for a `character_tags` junction row. `pending` = a suggestion awaiting
 *  "Accept"; `accepted` = the live tag; export reads `accepted` rows. Only `character_tags` carries a
 *  status — the other four junctions are accept-on-attach. */
export const TAG_STATUSES = ["pending", "accepted"] as const;
export const tagStatusSchema = z.enum(TAG_STATUSES);
export type TagStatus = z.infer<typeof tagStatusSchema>;

export const createTagSchema = z.object({
  name: z.string().min(NAME_MIN_LENGTH).max(NAME_MAX_LENGTH),
  color: z.string().optional(),
  source: tagSourceSchema.optional(),
});
export type CreateTagInput = z.infer<typeof createTagSchema>;

export const updateTagSchema = z.object({
  name: z.string().min(NAME_MIN_LENGTH).max(NAME_MAX_LENGTH).optional(),
  /** `null` clears back to the theme default (ST's link-to-theme reset); `undefined` leaves it untouched. */
  color: z.string().nullable().optional(),
  color2: z.string().nullable().optional(),
  source: tagSourceSchema.optional(),
  folderType: tagFolderTypeSchema.optional(),
  isHiddenOnCard: z.boolean().optional(),
});
export type UpdateTagInput = z.infer<typeof updateTagSchema>;

/** One tag row, as the library / management screen sees it. `color`/`color2` are `null` for theme-default;
 *  `sortOrder` is `null` when unordered (name fallback). */
export interface TagView {
  id: TagId;
  name: string;
  /** Chip BACKGROUND color (ST tag.color). `null` = theme default. */
  color: string | null;
  /** Chip TEXT color (ST tag.color2). `null` = theme default. */
  color2: string | null;
  source: TagSource | null;
  folderType: TagFolderType;
  /** Manual ordering position; `null` = unordered (name fallback). */
  sortOrder: number | null;
  /** ST is_hidden_on_character_card — chip suppressed on rows/cards while the tag keeps filtering. */
  isHiddenOnCard: boolean;
}

/** Per-junction usage rollup for the tag-management screen (one count per target type + the total). */
export interface TagUsage {
  characters: number;
  chats: number;
  worldBooks: number;
  personas: number;
  presets: number;
  total: number;
}

/** A tag plus its five-junction usage rollup (the management screen's read; drives "prune unused"). */
export interface TagWithUsage extends TagView {
  usage: TagUsage;
}

// TagAttachmentView DELETED (#1033 viewgap decision 1): test-only wire shape — no production consumer
// existed, and the junction row is read through domain-specific projections instead.

/** One PENDING auto/card tag suggestion staged on a character, joined to its tag row so the review UI
 *  can render the chip with its name + colors. Accept = `attachTag(status:'accepted')`; Reject = `detachTag`. */
export interface TagSuggestionView extends TagView {
  characterId: CharacterId;
}

/**
 * One entry of the character-library FILTER VOCABULARY — the projection a tag-filter chip is built from,
 * and nothing else.
 *
 * WHY IT IS NOT `TagWithUsage` (side-eye 2026-08-18 P2-6). The library's chip rail read the management
 * screen's rollup, which is every owned tag with all FIVE junction counts and the full display axes:
 * measured on the owner's library, **433,399 bytes for 1,736 rows** to paint 8 chips and a "+1,728 more"
 * link, and five `GROUP BY` queries to produce counts four of which the chips cannot use. The chip needs
 * exactly the id (the wire filter), the name (the label), whether it is card-hidden (the drop rule), and
 * the CHARACTER count (the rank + the "can this filter ever match" test) — 132,996 bytes for the same
 * 1,736 rows, from one `GROUP BY`.
 *
 * IT IS STILL EVERY OWNED TAG, deliberately: the vocabulary is also the REFERENTIAL AUTHORITY a persisted
 * `tagFilter` entry is checked against (`character-library-lens.ts` `knownTagIds`), and an id the answer
 * omits reads as "deleted" — which would drop a live filter. Dropping ROWS here is the one thing this
 * projection may not do; dropping COLUMNS is the whole point.
 */
export interface TagFilterVocabularyEntry {
  id: TagId;
  name: string;
  /** ST is_hidden_on_character_card — the chip rail drops these (they still filter, so they stay KNOWN). */
  isHiddenOnCard: boolean;
  /** How many of the owner's characters carry this tag ACCEPTED, over the WHOLE library (never a loaded
   *  window, and never a pending suggestion — #839: this number decides whether a facet is OFFERED, so it
   *  must count exactly what the library's `status = 'accepted'` tag filter can MATCH). */
  characters: number;
}

// Not a schema: ids are branded at their own `typeIdSchema` seam, not re-validated here.
