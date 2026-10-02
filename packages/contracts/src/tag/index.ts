// @orb/contracts/tag — the tag wire axes + create/update inputs + cross-boundary tag/junction views.
// The five targets are per-type FK junctions, not a polymorphic `(type, untyped_id)` table.
// `chat_tags` is a PER-USER overlay: its target has no `ownerId`, so the chat junction carries its own
// `ownerId` (the tagger) — `taggerId` is populated ONLY for `targetType: "chat"`. `status` (pending/
// accepted) is a `character_tags`-only junction column, not a parallel store.

import type { CharacterId, ChatId, PersonaId, PresetId, TagId, WorldBookId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

const NAME_MIN_LENGTH = 1;
const NAME_MAX_LENGTH = 200;

/** The five taggable entity types — each backed by its own per-type FK junction table. */
export const TAG_TARGET_TYPES = ["character", "chat", "worldBook", "persona", "preset"] as const;
export type TagTargetType = (typeof TAG_TARGET_TYPES)[number];
export const tagTargetTypeSchema = z.enum(TAG_TARGET_TYPES) satisfies z.ZodType<TagTargetType>;

/** Tag provenance (display-only axis). `manual` = user-typed · `auto` = corpus tag-suggest distillation ·
 *  `card` = adopted from a character card's tag field. Not semantic facets — that's `discovery`'s concern. */
export const TAG_SOURCES = ["manual", "auto", "card"] as const;
export const tagSourceSchema = z.enum(TAG_SOURCES);
export type TagSource = z.infer<typeof tagSourceSchema>;

/** ST's tags-as-folders state. `NONE` = plain tag · `OPEN` = folder, members stay in the main list ·
 *  `CLOSED` = folder, members hidden until entered. */
export const TAG_FOLDER_TYPES = ["NONE", "OPEN", "CLOSED"] as const;
// DECLARED off the tuple to keep the vocabulary's type face at its one home. Biome 2.5.1 still reports every
// `case` of an exhaustive switch over the `z.infer` alias as `lint/suspicious/noUnnecessaryConditions`
// "unreachable" (`character-list-view.ts`'s `groupStartsOpen` is the live dispatch); the probe that called
// this fixed ran under /tmp, where zod does not resolve, against `lint/correctness/noUnreachable`. Reproduce
// from an untracked file under `packages/contracts/src/`. `satisfies` is only a one-way
// assignability check; the `zod-output-twin-parity` gate proves exact parity.
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

/** A tag with adopted usage and staged suggestions. Prune requires both counts to be zero. */
export interface TagWithUsage extends TagView {
  usage: TagUsage;
  pendingSuggestions: number;
}

// TagAttachmentView DELETED (#1033 viewgap decision 1): test-only wire shape — no production consumer
// existed, and the junction row is read through domain-specific projections instead.

/** One PENDING auto/card tag suggestion staged on a character, joined to its tag row so the review UI
 *  can render the chip with its name + colors. Accept = `attachTag(status:'accepted')`; Reject = `detachTag`. */
export interface TagSuggestionView extends TagView {
  characterId: CharacterId;
  characterName: string;
}

/** The character-filter vocabulary projects only id, name, hidden status, and accepted character count, not
 *  the management rollup over every junction. The character count ranks the visible chips and tests whether
 *  a facet can match. Every owned tag still ships, including hidden/zero-usage tags: the row set is
 *  referential authority for persisted tagFilter ids, and omitting a live row would falsely mark it
 *  deleted. Drop columns, never rows.
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

/** The owner-authorized destinations of a label's adopted attachments. */
export type TagTargetRef =
  | { readonly targetType: "character"; readonly targetId: CharacterId }
  | { readonly targetType: "chat"; readonly targetId: ChatId }
  | { readonly targetType: "worldBook"; readonly targetId: WorldBookId }
  | { readonly targetType: "persona"; readonly targetId: PersonaId }
  | { readonly targetType: "preset"; readonly targetId: PresetId };

interface TagTargetIds {
  readonly character: CharacterId;
  readonly chat: ChatId;
  readonly worldBook: WorldBookId;
  readonly persona: PersonaId;
  readonly preset: PresetId;
}
export type TagAttachedEntity = { [K in TagTargetType]: { readonly targetType: K; readonly targetId: TagTargetIds[K]; readonly name: string } }[TagTargetType];

/** Reach is a bounded preview; totals remain in the adopted usage rollup. */
export const TAG_REACH_PREVIEW_LIMIT = 20;
export interface TagReachView {
  readonly entities: readonly TagAttachedEntity[];
  readonly hasMore: boolean;
}

export const tagViewSchema = z.strictObject({
  id: typeIdSchema(ID_PREFIX.tag),
  name: z.string(),
  color: z.string().nullable(),
  color2: z.string().nullable(),
  source: tagSourceSchema.nullable(),
  folderType: tagFolderTypeSchema,
  sortOrder: z.number().nullable(),
  isHiddenOnCard: z.boolean(),
}) satisfies z.ZodType<TagView>;

export const tagUsageSchema = z.strictObject({
  characters: z.number(),
  chats: z.number(),
  worldBooks: z.number(),
  personas: z.number(),
  presets: z.number(),
  total: z.number(),
}) satisfies z.ZodType<TagUsage>;

export const tagWithUsageSchema = tagViewSchema.extend({
  usage: tagUsageSchema,
  pendingSuggestions: z.number(),
}) satisfies z.ZodType<TagWithUsage>;

export const tagSuggestionViewSchema = tagViewSchema.extend({
  characterId: typeIdSchema(ID_PREFIX.character),
  characterName: z.string(),
}) satisfies z.ZodType<TagSuggestionView>;

export const tagFilterVocabularyEntrySchema = z.strictObject({
  id: typeIdSchema(ID_PREFIX.tag),
  name: z.string(),
  isHiddenOnCard: z.boolean(),
  characters: z.number(),
}) satisfies z.ZodType<TagFilterVocabularyEntry>;

export const tagAttachedEntitySchema = z.discriminatedUnion("targetType", [
  z.strictObject({ targetType: z.literal("character"), targetId: typeIdSchema(ID_PREFIX.character), name: z.string() }),
  z.strictObject({ targetType: z.literal("chat"), targetId: typeIdSchema(ID_PREFIX.chat), name: z.string() }),
  z.strictObject({ targetType: z.literal("worldBook"), targetId: typeIdSchema(ID_PREFIX.worldBook), name: z.string() }),
  z.strictObject({ targetType: z.literal("persona"), targetId: typeIdSchema(ID_PREFIX.persona), name: z.string() }),
  z.strictObject({ targetType: z.literal("preset"), targetId: typeIdSchema(ID_PREFIX.preset), name: z.string() }),
]) satisfies z.ZodType<TagAttachedEntity>;

export const tagReachViewSchema = z.strictObject({
  entities: z.array(tagAttachedEntitySchema).readonly(),
  hasMore: z.boolean(),
}) satisfies z.ZodType<TagReachView>;

export interface PruneUnusedResult {
  readonly removed: number;
}
export const pruneUnusedResultSchema = z.strictObject({ removed: z.number() }) satisfies z.ZodType<PruneUnusedResult>;
