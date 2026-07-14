// @orb/contracts/character — THE ONE canonical character card.
// No versions: the card IS the flat `characters` row, edited in place. No `raw` blob — every known field
// has a typed home, so an app-authored card round-trips identically to an imported one.

import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { injectionDirectiveSchema } from "@orb/kit/injection";
import { z } from "zod";
import { regexScriptSchema } from "#regex";
import { themeOverrideSchema } from "#theme";

const HANDLE_MIN = 1;
const HANDLE_MAX = 200;
const NAME_MIN = 1;
const NAME_MAX = 200;
const TEXT_MAX = 100_000;
const CREATOR_MAX = 200;
const CARD_VERSION_MAX = 200;
const GREETINGS_MAX = 100;
const REGEX_SCRIPTS_MAX = 500;

// Character's Note @ Depth: reuses the shared `@orb/kit/injection` `{depth, role?}` directive.
export const cardDepthPromptSchema = injectionDirectiveSchema.extend({
  /** The note text — macro-aware (`{{char}}`/`{{user}}`/…), resolved at assemble time. */
  prompt: z.string().max(TEXT_MAX),
});
export type CardDepthPrompt = z.infer<typeof cardDepthPromptSchema>;

// Derived pipeline signals (score + analysis) — not user-authored, absent from create/update.
export const refinerySignalsSchema = z.object({
  score: z.number().nullable(),
  analysis: z.record(z.string(), z.unknown()).nullable(),
});
export type RefinerySignals = z.infer<typeof refinerySignalsSchema>;

// Identity-free (no id/handle/ownerId — those are row identity columns, not card content).
export const characterCardSchema = z.object({
  name: z.string().min(NAME_MIN).max(NAME_MAX),
  description: z.string().max(TEXT_MAX).nullable(),
  personality: z.string().max(TEXT_MAX).nullable(),
  scenario: z.string().max(TEXT_MAX).nullable(),
  /** Ordered greetings — `[0]` is the first message, the rest are alternates. */
  greetings: z.array(z.string().max(TEXT_MAX)).max(GREETINGS_MAX),
  exampleMessages: z.string().max(TEXT_MAX).nullable(),
  systemPrompt: z.string().max(TEXT_MAX).nullable(),
  postHistoryInstructions: z.string().max(TEXT_MAX).nullable(),
  /** Character's Note \@ Depth, or null (no/empty note). */
  depthPrompt: cardDepthPromptSchema.nullable(),
  creatorNotes: z.string().max(TEXT_MAX).nullable(),
  // ── Typed promotions (D28): the fields neo leaked through `raw`, now first-class columns ──
  /** Card-author handle (ST `data.creator`). */
  creator: z.string().max(CREATOR_MAX).nullable(),
  /** Card author's freeform version STRING (ST `data.character_version`, e.g. "1.2") — NEVER an int counter. */
  cardVersion: z.string().max(CARD_VERSION_MAX).nullable(),
  regexScripts: z.array(regexScriptSchema).max(REGEX_SCRIPTS_MAX),
  /** Residual `data.extensions` MINUS the promoted-to-column fields — genuinely-unknown vendor extras only. */
  extensions: z.record(z.string(), z.unknown()).nullable(),
  /** Residual TOP-LEVEL `data.*` keys MINUS the promoted-to-column fields — distinct from `extensions`. */
  residualData: z.record(z.string(), z.unknown()).nullable(),
  avatarAssetId: typeIdSchema(ID_PREFIX.asset).nullable(),
  /** CardRefinery pipeline signals (derived, not authored). */
  refinery: refinerySignalsSchema.nullable(),
});
export type CharacterCard = z.infer<typeof characterCardSchema>;

// The ONE schema the tRPC router AND the import normalizer validate against. Pipeline-derived `refinery`
// is NOT here. null clears a field; omit to leave it unchanged.
export const createCharacterSchema = z.object({
  handle: z.string().min(HANDLE_MIN).max(HANDLE_MAX),
  name: z.string().min(NAME_MIN).max(NAME_MAX),
  description: z.string().max(TEXT_MAX),
  personality: z.string().max(TEXT_MAX).nullable().optional(),
  scenario: z.string().max(TEXT_MAX).nullable().optional(),
  greetings: z.array(z.string().max(TEXT_MAX)).max(GREETINGS_MAX).nullable().optional(),
  exampleMessages: z.string().max(TEXT_MAX).nullable().optional(),
  systemPrompt: z.string().max(TEXT_MAX).nullable().optional(),
  postHistoryInstructions: z.string().max(TEXT_MAX).nullable().optional(),
  creatorNotes: z.string().max(TEXT_MAX).nullable().optional(),
  creator: z.string().max(CREATOR_MAX).nullable().optional(),
  cardVersion: z.string().max(CARD_VERSION_MAX).nullable().optional(),
  regexScripts: z.array(regexScriptSchema).max(REGEX_SCRIPTS_MAX).nullable().optional(),
  extensions: z.record(z.string(), z.unknown()).nullable().optional(),
  residualData: z.record(z.string(), z.unknown()).nullable().optional(),
  avatarAssetId: typeIdSchema(ID_PREFIX.asset).nullable().optional(),
  /** Character's Note \@ Depth — null clears it; omit to leave unchanged. */
  depthPrompt: cardDepthPromptSchema.nullable().optional(),
});
export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;

export const updateCharacterSchema = createCharacterSchema.partial().extend({
  starred: z.boolean().optional(),
  archived: z.boolean().optional(),
  forbidExternalMedia: z.boolean().nullable().optional(),
  /** Tri-state: null = inherit the deployment default, true = HTML renders TRUSTED, false = force untrusted. */
  trustHtml: z.boolean().nullable().optional(),
  /** `undefined` = leave unchanged; `null` = clear (inherit global theme); a value = set it. */
  themeOverride: themeOverrideSchema.nullable().optional(),
});
export type UpdateCharacterInput = z.infer<typeof updateCharacterSchema>;

// Each sort needs its own keyset, so the wire cursor is discriminated by `sort`. Default = `recent`.
export const CHARACTER_LIST_SORTS = [
  "recent",
  "alpha",
  "starred",
  "newest",
  "oldest",
  "mostChats",
  "fewestChats",
  "largestCards",
  "smallestCards",
] as const;
export type CharacterListSort = (typeof CHARACTER_LIST_SORTS)[number];
export const characterListSortSchema = z.enum(CHARACTER_LIST_SORTS);

// `sort` is carried in the payload so the server can reject a cursor minted under a different sort.
export const characterListCursorSchema = z.discriminatedUnion("sort", [
  z.object({
    sort: z.literal("recent"),
    /** `null` = the boundary row has never been chatted (the NULLS-LAST tail). */
    lastChattedAt: z.number().int().nullable(),
    createdAt: z.number().int(),
    id: typeIdSchema(ID_PREFIX.character),
  }),
  z.object({
    sort: z.literal("alpha"),
    name: z.string(),
    id: typeIdSchema(ID_PREFIX.character),
  }),
  z.object({
    sort: z.literal("starred"),
    starred: z.boolean(),
    name: z.string(),
    id: typeIdSchema(ID_PREFIX.character),
  }),
  z.object({
    sort: z.literal("newest"),
    createdAt: z.number().int(),
    id: typeIdSchema(ID_PREFIX.character),
  }),
  z.object({
    sort: z.literal("oldest"),
    createdAt: z.number().int(),
    id: typeIdSchema(ID_PREFIX.character),
  }),
  z.object({
    sort: z.literal("mostChats"),
    /** `null` = the boundary row has no `character_stats` row (never chatted → the NULLS-LAST tail). */
    chatCount: z.number().int().nullable(),
    id: typeIdSchema(ID_PREFIX.character),
  }),
  z.object({
    sort: z.literal("fewestChats"),
    /** `null` = the boundary row has no `character_stats` row (never chatted → the NULLS-LAST tail). */
    chatCount: z.number().int().nullable(),
    id: typeIdSchema(ID_PREFIX.character),
  }),
  z.object({
    sort: z.literal("largestCards"),
    /** The `characters.token_size` denorm — notNull, so never null (no NULLS-LAST handling). */
    tokenSize: z.number().int(),
    id: typeIdSchema(ID_PREFIX.character),
  }),
  z.object({
    sort: z.literal("smallestCards"),
    /** The `characters.token_size` denorm — notNull, so never null (no NULLS-LAST handling). */
    tokenSize: z.number().int(),
    id: typeIdSchema(ID_PREFIX.character),
  }),
]);
export type CharacterListCursor = z.infer<typeof characterListCursorSchema>;

// The strict ST `chara_card_v3` wire object; `.loose()` keeps unknown vendor keys riding through.
export const CHARA_CARD_V3_SPEC = "chara_card_v3";

// biome-ignore-start lint/style/useNamingConvention: ST Character-Card-V3 wire field names (snake_case)
const characterBookEntrySchema = z
  .object({
    keys: z.array(z.string()),
    content: z.string(),
    enabled: z.boolean(),
    insertion_order: z.number(),
    comment: z.string().optional(),
    constant: z.boolean().optional(),
    extensions: z.record(z.string(), z.unknown()).optional(),
  })
  .loose();

const characterBookSchema = z.object({ entries: z.array(characterBookEntrySchema) }).loose();

const characterCardV3DataSchema = z
  .object({
    name: z.string(),
    description: z.string(),
    personality: z.string(),
    scenario: z.string(),
    first_mes: z.string(),
    mes_example: z.string(),
    system_prompt: z.string(),
    post_history_instructions: z.string(),
    creator: z.string(),
    creator_notes: z.string(),
    character_version: z.string(),
    alternate_greetings: z.array(z.string()),
    tags: z.array(z.string()),
    extensions: z.record(z.string(), z.unknown()),
    character_book: characterBookSchema.optional(),
  })
  .loose();

export const characterCardV3Schema = z
  .object({
    spec: z.literal(CHARA_CARD_V3_SPEC),
    spec_version: z.string(),
    data: characterCardV3DataSchema,
  })
  .loose();
// biome-ignore-end lint/style/useNamingConvention: ST Character-Card-V3 wire field names (snake_case)

/** The ST V3 card object the serde emits/parses (the shape `buildCardV3` returns + `writeCardChunk` writes). */
export type CharacterCardV3 = z.infer<typeof characterCardV3Schema>;
