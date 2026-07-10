// @orb/contracts/tag — the tag wire axes + create/update inputs + cross-boundary tag/junction views.
//
// Cross-boundary: the tRPC router validates against these AND the client (attachment UI, tag-management
// screen, library filters) deep-imports the same schemas/views, so server and client can never disagree
// about what's a valid target type / source / folder state, or what a tag row looks like. Neo-tavern
// re-spelled these unions inline 2–5× across `trpc/routers/tag.ts` + `contract/{params,views}.ts`; here
// each is ONE `as const` tuple + ONE `z.enum` (the `no-inline-union-redecl` gate).
//
// DAG ROOT: kit-only (the branded ids from `@orb/kit/ids`) + zod. No domain, no `@orb/db`, no sibling
// contracts node.
//
// D-deviations applied:
//  • D24 — the five targets are per-type FK junctions (NOT a polymorphic `(type, untyped_id)` table); the
//    polymorphic *dispatch* (the registry Record keyed by `TagTargetType`) is a DOMAIN concern, not here.
//    `TagTargetType` is exactly character|chat|worldBook|persona|preset.
//  • D30 — `chat_tags` is a PER-USER overlay: its target (`chats`) has no `ownerId` (D18), so the chat
//    junction carries its OWN `ownerId` (the tagger) and is membership-gated; the other four junctions
//    derive their owner from the owned target. The junction view below reflects this — `taggerId` is
//    populated ONLY for `targetType: "chat"` (null elsewhere).
//  • The `proposedTags` → `character_tags.status` redesign (the two-surface collapse): neo's
//    staging JSON column on `character_versions` (a table D28 deletes outright) collapses into a junction
//    STATUS column — `pending` (import / corpus distillation suggestion, awaiting accept) | `accepted`
//    (the live tag). "Promote" is a status flip, not a copy; export reads `accepted` rows. The status is
//    a junction column (a single surface), NOT a parallel store — modeled here as the `tagStatusSchema`
//    axis the client filters on.

import type {
  CharacterId,
  ChatId,
  PersonaId,
  PresetId,
  TagId,
  UserId,
  WorldBookId,
} from "@orb/kit/ids";
import { z } from "zod";

// ── Field caps (named so the literals aren't bare magic numbers) ──────────────
const NAME_MIN_LENGTH = 1;
const NAME_MAX_LENGTH = 200;

// ── The three tag axes (one home each; tuple-in-contracts since there is no pure kit half) ────────────

/** The five taggable entity types — each backed by its OWN per-type FK junction table (D24: no
 *  polymorphic association table). The polymorphic *dispatch* Record (`{ [K in TagTargetType]: … }`) is
 *  the tag DOMAIN's junction registry; this is just the axis both sides validate against. */
export const TAG_TARGET_TYPES = ["character", "chat", "worldBook", "persona", "preset"] as const;
export const tagTargetTypeSchema = z.enum(TAG_TARGET_TYPES);
export type TagTargetType = z.infer<typeof tagTargetTypeSchema>;

/** Tag provenance (display-only axis; behavior is identical across the three). `manual` = user-typed ·
 *  `auto` = minted by corpus tag-suggest distillation review · `card` = adopted from a character card's
 *  tag field via promote. NOT semantic facets (genre/tone/theme) — those are `discovery`'s concern
 *  (Core-0 §6 partitioning: descriptive labels → tag, semantic facets → discovery), so no `theme`/`facet`
 *  member here. */
export const TAG_SOURCES = ["manual", "auto", "card"] as const;
export const tagSourceSchema = z.enum(TAG_SOURCES);
export type TagSource = z.infer<typeof tagSourceSchema>;

/** ST's tags-as-folders state. `NONE` = plain tag · `OPEN` = folder row, members stay in the main list ·
 *  `CLOSED` = folder row, members hidden until the folder is entered. (Neo mis-homed this in
 *  `contract/views.ts`; one home here so both the update input and the view derive from it.) */
export const TAG_FOLDER_TYPES = ["NONE", "OPEN", "CLOSED"] as const;
export const tagFolderTypeSchema = z.enum(TAG_FOLDER_TYPES);
export type TagFolderType = z.infer<typeof tagFolderTypeSchema>;

/** The proposed/accepted surface for a `character_tags` junction row (the `proposedTags` redesign). One
 *  surface: `pending` = a suggestion (import / corpus distillation) awaiting the user's "Accept";
 *  `accepted` = the live tag. "Promote" flips `pending` → `accepted`; export reads `accepted` rows. The
 *  client filters the character-tag list on this axis. Only `character_tags` carries a status today — the
 *  other four junctions are accept-on-attach (no staging surface). */
export const TAG_STATUSES = ["pending", "accepted"] as const;
export const tagStatusSchema = z.enum(TAG_STATUSES);
export type TagStatus = z.infer<typeof tagStatusSchema>;

// ── Create / update wire inputs (neo declared these inline in the tRPC router — named here so the client
//    form validators and the server input handlers reference ONE object; any drift is a `tsc` error) ───

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

// ── Cross-boundary views (the client deep-imports these; the domain's `contract/views.ts` re-exports,
//    never re-declares — one home, no second declaration the client could disagree with) ───────────────

/** One tag row, as the library / management screen sees it. `color`/`color2` are `null` for theme-default
 *  (ST's link-to-theme); `sortOrder` is `null` when unordered (name fallback). */
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

/** One junction row — the wire shape for "tag X is attached to target Y". `targetType` discriminates which
 *  per-type FK table the row lives in (D24); `targetId` is the (plain-text) target ref.
 *
 *  D30 — the per-user exception: `taggerId` is the chat-tag overlay's own `ownerId` (the tagging user),
 *  populated ONLY when `targetType === "chat"` (whose target carries no owner, D18) and `null` for the
 *  four target-derived junctions (their owner is the target's owner, not a junction column).
 *
 *  `status` is meaningful only for `targetType === "character"` (the proposed/accepted surface — the
 *  `proposedTags` redesign); it is `null` for the other four (accept-on-attach, no staging). */
export interface TagAttachmentView {
  tagId: TagId;
  targetType: TagTargetType;
  targetId: string;
  /** D30: the tagger (chat-tag per-user overlay) — non-null ONLY for `targetType: "chat"`. */
  taggerId: UserId | null;
  /** The proposed/accepted surface — non-null ONLY for `targetType: "character"`. */
  status: TagStatus | null;
}

/** One PENDING auto/card tag suggestion staged on a character (the `pending` half of `character_tags`),
 *  joined to its tag row so the review UI can render the chip WITH its name + colors — the bare
 *  {@link TagAttachmentView} carries no name, and the Accept/Reject surface needs the label. Produced by
 *  `tag.listPendingSuggestions` (the read for PD-40's distilled suggestions + import's staged card tags);
 *  `source` is display-only provenance (`auto` = corpus distillation, `card` = a card's native tags). Accept
 *  = `attachTag(status:'accepted')` (flips the row); Reject = `detachTag`. */
export interface TagSuggestionView extends TagView {
  /** The character the suggestion is staged on (the review surface is per-editor or a global inbox). */
  characterId: CharacterId;
}

// The branded target-id union the per-type junctions FK (D24) — exported for consumers that need to name
// the concrete id type behind `TagAttachmentView.targetId` (which stays plain `string` on the wire, since
// the tRPC boundary parses the discriminated brand from `targetType`). Not a schema: ids are branded at
// their own `typeIdSchema` seam, not re-validated here.
export type TagTargetId = CharacterId | ChatId | WorldBookId | PersonaId | PresetId;
