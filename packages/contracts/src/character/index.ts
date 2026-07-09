// @orb/contracts/character — THE ONE canonical character card (ledger D28, serialization-core §7.3 LOCKED).
//
// D28: there are NO character versions. The card IS the flat `characters` row, edited in place — so the
// canonical card shape is the live-row content: identity-free card fields (name … creatorNotes) PLUS the
// typed promotions `creator` / `cardVersion` / `regexScripts` / `extensions` / `residualData` /
// `avatarAssetId` / `refinery`. There is NO `raw` blob (§7.3 lossiness fix — every known field has a typed
// home, so an app-authored card round-trips identically to an imported one), NO `character_version` integer
// counter, NO `currentVersionId`. `residualData` (PD-127) is the top-level-`data.*` sibling of `extensions`
// (which is scoped to `data.extensions.*`) — hygiene-only preservation, backed by the `characters.residual_data`
// column.
//
// Cross-boundary: the tRPC router validates `create`/`update` against these AND the client form runs the same
// schemas, so client and server can never disagree about what's valid. The same `createCharacterSchema` gates
// BOTH the CRUD wire AND the tolerant import normalizer's output (the IN adapter normalizes messy real-world
// JSON INTO this one shape — serialization-core §7.3 inv 3); there is no parallel lossy card schema.
//
// `regexScripts` is the typed `RegexScript[]` column (D28) from `#regex` — the kit↔contracts tuple rule keeps
// the find/replace executor vocab DOWN in `@orb/kit/regex` and the persisted wire schema in `@orb/contracts`.
// The card's `depthPrompt` (Character's Note @ Depth) reuses the SHARED `@orb/kit/injection` `{depth, role?}`
// directive — its role is the canonical `MessageRole` axis (`@orb/kit/message-role`, wrapped by the kit
// injection schema), NOT a card-local role union (D32). The embedded `character_book` is a SELF-CONTAINED
// ST-V3 wire sub-schema (the serde in `@orb/server/kit` maps it → `world_entries`); it deliberately does NOT
// reuse `@orb/contracts/world-info`'s entry schema, so `character` stays a Layer-1 node (→ regex only).

import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { injectionDirectiveSchema } from "@orb/kit/injection";
import { z } from "zod";
import { regexScriptSchema } from "#regex";
import { themeOverrideSchema } from "#theme";

// ── Field bounds (named — noMagicNumbers) ──────────────────────────────────
const HANDLE_MIN = 1;
const HANDLE_MAX = 200;
const NAME_MIN = 1;
const NAME_MAX = 200;
// All card free-text capped at 100k (matches `description`): bounded so a client can't store unbounded
// content that later reaches the prompt.
const TEXT_MAX = 100_000;
const CREATOR_MAX = 200;
const CARD_VERSION_MAX = 200;
const GREETINGS_MAX = 100;
const REGEX_SCRIPTS_MAX = 500;

// ── Character's Note @ Depth (ST `data.extensions.depth_prompt`) ────────────
// A recurring per-character snippet spliced into chat history at a fixed depth + role — the SAME at-depth
// mechanism world-info-at-depth and the persona description use. Reuses the shared `{depth, role?}` directive
// (`@orb/kit/injection`, role = `MessageRole`, D32) and adds the note `prompt`. An empty `prompt` is treated
// as "no note" at assemble time. `depth` is required; `role` is optional (the assembler defaults it).
export const cardDepthPromptSchema = injectionDirectiveSchema.extend({
  /** The note text — macro-aware (`{{char}}`/`{{user}}`/…), resolved at assemble time. */
  prompt: z.string().max(TEXT_MAX),
});
export type CardDepthPrompt = z.infer<typeof cardDepthPromptSchema>;

// assistant @ depth 0 = a trailing assistant message = response PREFILL — unsupported across providers (the
// SAME write guard world-info + persona injections apply). The read path stays lenient (the serde normalizes
// a legacy/imported value), so this guard layers only on the WRITE side.
const PREFILL_DEPTH = 0;

/** Write-side depth-prompt guard: validates the directive shape AND rejects the `assistant@depth-0` prefill. */
export const cardDepthPromptWriteSchema = cardDepthPromptSchema.superRefine((val, ctx): void => {
  if (val.role === "assistant" && val.depth === PREFILL_DEPTH) {
    ctx.addIssue({
      code: "custom",
      path: ["depth"],
      message:
        "assistant-role at depth 0 is a response prefill — unsupported across providers. Use depth >= 1, or role user/system.",
    });
  }
});

// ── Refinery signals (the CardRefinery pipeline output — local, not on the ST wire) ────
// Derived corpus-pipeline signals carried on the flat card row (D28 `refinery*`): a numeric score and an
// opaque analysis blob. Pipeline-produced, NOT user-authored — so they ride on the canonical card (read)
// but are absent from `create`/`update` (you don't hand-author a refinery score).
export const refinerySignalsSchema = z.object({
  score: z.number().nullable(),
  analysis: z.record(z.string(), z.unknown()).nullable(),
});
export type RefinerySignals = z.infer<typeof refinerySignalsSchema>;

// ── THE canonical card (serialization-core §7.3 — ONE fully-modeled shape, the live `characters` row) ────
// The shape `getCard` returns and the serde normalizes INTO. Identity-free (no id/handle/ownerId — those are
// the row's identity columns, not card content): every field here is card CONTENT. `greetings[0]` is the
// first message; the rest are alternate greetings. `regexScripts` is the typed column (D28). No `raw`, no
// `character_version` counter, no `currentVersionId` — the §7.3 lossiness fix.
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
  /** Card regex scripts (the typed column) — `RegexScript[]` from `@orb/contracts/regex`. */
  regexScripts: z.array(regexScriptSchema).max(REGEX_SCRIPTS_MAX),
  /** Residual `data.extensions` MINUS the promoted-to-column fields — genuinely-unknown vendor extras only. */
  extensions: z.record(z.string(), z.unknown()).nullable(),
  /** Residual TOP-LEVEL `data.*` keys MINUS the promoted-to-column fields (PD-127) — e.g. ST-V3's `source` /
   *  `creation_date` / `creator_notes_multilingual` / `nickname` / `group_only_greetings`, none of which have
   *  a typed column yet. Hygiene-only preservation, backed by the `characters.residual_data` column (PD-127)
   *  — matches `extensions`'s treatment exactly (nullable, not optional). Distinct from `extensions` (that's
   *  `data.extensions.*`, this is `data.*`). */
  residualData: z.record(z.string(), z.unknown()).nullable(),
  avatarAssetId: typeIdSchema(ID_PREFIX.asset).nullable(),
  /** CardRefinery pipeline signals (derived, not authored). */
  refinery: refinerySignalsSchema.nullable(),
});
export type CharacterCard = z.infer<typeof characterCardSchema>;

// ── CRUD wire schemas — the ONE schema the tRPC router AND the import normalizer validate against ────
// `create` is the authoring input: handle (identity) + card content + the typed promotions, so an app can
// author a COMPLETE card (the §7.3 lossiness fix — app-authored == imported). Pipeline-derived `refinery` is
// NOT here. Tags are the `character_tags` junction, NOT a `proposedTags` blob (D-adapt: neo's
// `proposedTags` is dropped — import writes pending junction rows instead). null clears a field; omit to
// leave it unchanged.
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
  depthPrompt: cardDepthPromptWriteSchema.nullable().optional(),
});
export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;

// `update` is `create` with every field optional, plus the identity-only flags that are NOT card content
// (`starred`, `archived`, the tri-state `forbidExternalMedia`, the tri-state `trustHtml`: null = inherit
// the deployment default, and the nullable `themeOverride`: null = clear/no override, inherit the user's
// global selected theme). The tRPC router extends this with the branded `characterId` at its boundary.
export const updateCharacterSchema = createCharacterSchema.partial().extend({
  starred: z.boolean().optional(),
  archived: z.boolean().optional(),
  forbidExternalMedia: z.boolean().nullable().optional(),
  // D44 §12.0 render-trust OPT-IN. Tri-state: null = inherit the deployment default, true = this
  // character's HTML renders TRUSTED (rich HTML + Mermaid), false = force untrusted. (`override ?? global`.)
  trustHtml: z.boolean().nullable().optional(),
  // D44 §12.1/§12.5 — the per-character theme-token override. `undefined` ⇒ leave unchanged; `null` ⇒
  // clear it (inherit the global selected theme); a value ⇒ set it. Validated leniently (per-field
  // `.catch` — themeOverrideSchema, `#theme`), mirroring the entity's own write boundary.
  themeOverride: themeOverrideSchema.nullable().optional(),
});
export type UpdateCharacterInput = z.infer<typeof updateCharacterSchema>;

// ── The library-list sort axis + its sort-discriminated keyset cursor (FINAL-Character §4.5) ──────────
// The `list` verb reads in one of these orders; each needs its OWN keyset (a single tuple can't serve them
// all), so the wire cursor is DISCRIMINATED by `sort`. The canonical `as const` tuple is the ONE home
// (§5.5; the domain verb's dispatch + the tRPC input both derive — never re-spell). Default = `recent`.
//   • recent      — most-recently-chatted first: `(lastChattedAt DESC NULLS-LAST, createdAt DESC, id DESC)`.
//                   `lastChattedAt` is nullable (never-chatted sinks to the tail) → the cursor carries it as
//                   `number | null` and the query does explicit null-boundary handling.
//   • alpha       — `(name ASC, id ASC)`; `name` is NOT unique, so `id` is the deterministic tiebreak.
//   • starred     — starred-first then the alpha keyset: `(starred DESC, name ASC, id ASC)`.
//   • newest      — `(createdAt DESC, id DESC)`; `createdAt` is not unique, so `id` is the tiebreak.
//   • oldest      — `(createdAt ASC, id ASC)`; the direction-flipped twin of `newest` (own predicate).
//   • mostChats   — `(chatCount DESC NULLS-LAST, id DESC)`. `chatCount` is `character_stats.chats` LEFT-JOINed
//                   on the owner (D23 — join via `characters`); a never-chatted card has NO stats row, so the
//                   join yields null → the tail, exactly like `recent`. Carried as `number | null` with
//                   explicit null-boundary handling; `chats` is not unique, so `id` tiebreaks.
//   • fewestChats — `(chatCount ASC NULLS-LAST, id ASC)`; the direction-flipped twin of `mostChats` (nulls
//                   STILL sink to the tail — never-chatted is never "fewest").
//   • largestCards  — `(tokenSize DESC, id DESC)`. `tokenSize` is the `characters.token_size` DENORM column
//                     (notNull, stamped by `substrate/card-tokens` at every content write) → NO null handling;
//                     not unique, so `id` tiebreaks.
//   • smallestCards — `(tokenSize ASC, id ASC)`; the direction-flipped twin of `largestCards`.
// `tokenSize` MUST be a persisted column (not the post-query JS estimate) for these two to be a keyset ORDER BY
// — that's why `characters.token_size` exists. neo's `random` (keyset-incompatible) and `name-desc` are drops.
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

// ONE object field on the wire (tRPC's `infiniteQueryOptions` threads exactly one `cursor`, overwriting it
// wholesale each page — a sibling field would go stale). The `sort` discriminant is carried IN the payload so
// the server can detect a cursor minted under a DIFFERENT sort (a threading bug) and reject it, rather than
// silently apply the wrong keyset and return misordered/duplicated rows.
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

// ── The ST V3 card wire shape (serde IN/OUT pivot) ──────────────────────────
// The strict ST `chara_card_v3` wire object the export emitter writes and the import reader parses. SELF-
// CONTAINED: its embedded `character_book` is the ST V3 lorebook wire sub-schema (the serde maps it →
// `world_entries`); it does NOT reuse `@orb/contracts/world-info` (which would re-add a world-info edge).
// `.loose()` keeps unknown vendor keys riding through. The card↔canonical mappers (`cardFromJson`/
// `buildCardV3`) are server-only serde and live in `@orb/server/kit/serde/card`, NOT here.
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
