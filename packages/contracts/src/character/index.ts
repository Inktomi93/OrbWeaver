// @orb/contracts/character — THE ONE canonical character card.
// No versions: the card IS the flat `characters` row, edited in place. No `raw` blob — every known field
// has a typed home, so an app-authored card round-trips identically to an imported one.

import type { CharacterHandle } from "@orb/kit/ids";
import { castId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { injectionDirectiveSchema } from "@orb/kit/injection";
import { z } from "zod";
import { cardFaceFields } from "#card-face";
import { refineryAnalyzePayloadSchema } from "#refinery";
import { regexScriptCardSchema } from "#regex";
import { themeBackgroundSchema, themeOverrideSchema } from "#theme";
import { worldBookRoleSchema } from "#world-info";

const HANDLE_MIN = 1;
const HANDLE_MAX = 200;
// CARD-CONTENT ceiling (greetings/systemPrompt/…). The FACE fields (name/description/starred/
// avatarAssetId) spread `cardFaceFields` (D137(E)) — their limits live in `#card-face`, not here.
const TEXT_MAX = 100_000;
const CREATOR_MAX = 200;
const CARD_VERSION_MAX = 200;
const NICKNAME_MAX = 200;
const SOURCE_MAX = 100;
const GREETINGS_MAX = 100;
const REGEX_SCRIPTS_MAX = 500;

// ── Card spec markers (Character-Card V2 / V3) ──────────────────────────────────────────────────────────
// The wire `spec` values this serde reads AND emits. V1 + Pygmalion-Gradio cards normalize to the V2 field
// set (they predate V2 but share its `{ data }` shape). V3 is a strict SUPERSET of V2 — every V2 field plus
// the additive ones (`assets`/`nickname`/`source`/`group_only_greetings`/`creator_notes_multilingual`/
// `creation_date`/`modification_date`, lorebook `use_regex`), so a V2 card IS a V3 card with the extras
// absent. The canonical card carries the spec it was READ from so export round-trips it (V2→V2, V3→V3).
export const CHARA_CARD_V2_SPEC = "chara_card_v2";
export const CHARA_CARD_V3_SPEC = "chara_card_v3";
export const CARD_SPECS = [CHARA_CARD_V2_SPEC, CHARA_CARD_V3_SPEC] as const;
export const cardSpecSchema = z.enum(CARD_SPECS);
export type CardSpec = (typeof CARD_SPECS)[number];

// V3 `data.assets[]` — the media manifest; each entry is `{type,uri,name,ext}` (the RisuAI/charx shape,
// e.g. `{type:"icon",uri:"ccdefault:",name:"main",ext:"png"}` or an `embeded://…` charx-ZIP path). PARSED +
// PRESERVED only. Resolving an asset URI — charx ZIP extraction, an `http(s)` fetch, `ccdefault:` — and
// consuming it (expression sprites → the expressions domain, the gallery) is a SEPARATE later chunk that
// MUST ride the H1 egress firewall: a card is untrusted, so a URI fetch is an SSRF surface. The serde stays
// pure parse-and-validate (kit is isomorphic, zero I/O). `.loose()` keeps unknown asset keys; the fields are
// lenient (a real-world asset with a missing `type`/`name` never throws — ST defaults them to `""`).
export const cardAssetSchema = z
  .object({
    type: z.string().catch(""),
    uri: z.string().catch(""),
    name: z.string().catch(""),
    ext: z.string().catch(""),
  })
  .loose();
/** @public type twin of `cardAssetSchema`, live in this file's card schema. */
export type CardAsset = z.infer<typeof cardAssetSchema>;

// Character's Note @ Depth: reuses the shared `@orb/kit/injection` `{depth, role?}` directive.
export const cardDepthPromptSchema = injectionDirectiveSchema.extend({
  /** The note text — macro-aware (`{{char}}`/`{{user}}`/…), resolved at assemble time. */
  prompt: z.string().max(TEXT_MAX),
});
export type CardDepthPrompt = z.infer<typeof cardDepthPromptSchema>;

// Derived pipeline signals (score + analysis) — not user-authored, absent from create/update. The
// signals object is a CARD field (this file's home turf, like depthPrompt); the analysis half is the
// refinery pipeline's TYPED analyze payload (per-run verdict/soul-check shape — `#refinery` owns it).
// Import direction is one-way BY LAW: `#refinery` never imports `#character` (its header states why).
// The read seam's whole-object `.catch(null)` (character persistence) heals any pre-tightening loose
// blob to null — the pre-launch bargain, no migration mechanics.
// `score` holds the pipeline's 1-10 rubric (a score run's `overallScore`) — tightened IN THE SAME CHANGE
// as the read seam's field-level heal split (security pass §1 gap 2's ordering condition: tightening
// under the old whole-object catch would have wiped BOTH halves on any legacy out-of-range value).
export const refinerySignalsSchema = z.object({
  score: z.number().min(1).max(10).nullable(),
  analysis: refineryAnalyzePayloadSchema.nullable(),
});
export type RefinerySignals = z.infer<typeof refinerySignalsSchema>;

// PD-144: one attached world-info book REFERENCE carried on a portable card — `{worldBookId, role}` mirrors
// the `character_books` junction columns (`createdAt` is NOT carried — a re-link is a fresh attach). Books
// are NEVER cloned/embedded through this channel: export bundles the references, import re-links each id it
// can access on the importing install and skips the rest (the portability twin of the PD-141 duplicate carry).
export const attachedBookRefSchema = z.object({
  worldBookId: typeIdSchema(ID_PREFIX.worldBook),
  role: worldBookRoleSchema,
});
export type AttachedBookRef = z.infer<typeof attachedBookRefSchema>;

// The V3-wire key the references ride under (orbweaver-namespaced so it never collides with an ST `data.*`
// field). The ONE literal home — the serde OUT-emitter + the import extractor read it from here.
export const ATTACHED_BOOKS_WIRE_KEY = "orbweaver_attached_books";

// ── Greeting (V3 promotion Phase B) ─────────────────────────────────────────────────────────────────────
// ONE greetings array folds the former three ST wire fields: `first_mes` (greetings[0].text), the
// `alternate_greetings` (the rest, `groupOnly` absent/false), and `group_only_greetings` (`groupOnly: true`) —
// offered only in group chats. The serde re-splits them on export (`buildCardV3`) so the round-trip is lossless.
// The owner-decided lock-the-extensible-shape call (the parallel-column alternative was rejected).
export const greetingSchema = z.object({
  /** The greeting text — macro-aware (`{{char}}`/`{{user}}`/…), resolved at read. */
  text: z.string().max(TEXT_MAX),
  /** True ⇒ offered ONLY in group chats (ST `data.group_only_greetings`). Absent ⇒ a normal greeting. Never
   *  set on greetings[0] (the first message is always solo-eligible). */
  groupOnly: z.boolean().optional(),
});
export type Greeting = z.infer<typeof greetingSchema>;

/** The always-a-list DB read-seam coercion for the `characters.greetings` JSON column (+ snapshot blobs): a
 *  corrupt/non-array value collapses to `[]`. The ONE home the row→view readers share (queries `cardOf`). */
export const greetingsColumnSchema = z.array(greetingSchema).catch([]);

// Identity-free (no id/handle/ownerId — those are row identity columns, not card content).
export const characterCardSchema = z.object({
  name: cardFaceFields.name,
  // The face description, `.nullable()` per card-spec fidelity (a V2/V3 card may omit it) — the wrap is
  // character's write semantics; the inner validator is the ONE home.
  description: cardFaceFields.description.nullable(),
  personality: z.string().max(TEXT_MAX).nullable(),
  scenario: z.string().max(TEXT_MAX).nullable(),
  /** Ordered greetings — `[0]` is the first message, the rest are alternates; `groupOnly` marks a
   *  group-chat-only greeting (the folded ST `group_only_greetings`). */
  greetings: z.array(greetingSchema).max(GREETINGS_MAX),
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
  // ── V3 content promotions: the four `data.*` fields that had a residual home, now first-class columns.
  //    Absent on a V2 / app-authored card ⇒ null (the V2-omits-them-cleanly property export relies on). ──
  /** Prompt-facing display name overriding `{{char}}` (ST V3 `data.nickname`). */
  nickname: z.string().max(NICKNAME_MAX).nullable(),
  /** Provenance URLs / ids the card was sourced from (ST V3 `data.source`). */
  source: z.array(z.string().max(TEXT_MAX)).max(SOURCE_MAX).nullable(),
  /** Unix-seconds authorship timestamp (ST V3 `data.creation_date`). */
  creationDate: z.number().int().nullable(),
  /** Unix-seconds last-modification timestamp (ST V3 `data.modification_date`). */
  modificationDate: z.number().int().nullable(),
  /** The ST card-wire regex scripts (`data.extensions.regex_scripts` / V2 root `data.regex_scripts`) —
   *  the LIFT/RE-EMBED slot, present ONLY at the serde boundary: the importer hands these to the regex
   *  domain to mint library rows + a `character_regex_scripts` attachment, and the exporter fills it by
   *  walking that junction back out (byte-shape-identical ST wire). The DOMAIN's card projection OMITS it
   *  — a character does not carry scripts by value any more (D121-E). */
  regexScripts: z.array(regexScriptCardSchema).max(REGEX_SCRIPTS_MAX).optional(),
  /** Residual `data.extensions` MINUS the promoted-to-column fields — genuinely-unknown vendor extras only. */
  extensions: z.record(z.string(), z.unknown()).nullable(),
  /** Residual TOP-LEVEL `data.*` keys MINUS the promoted-to-column fields — distinct from `extensions`. */
  residualData: z.record(z.string(), z.unknown()).nullable(),
  avatarAssetId: cardFaceFields.avatarAssetId,
  /** CardRefinery pipeline signals (derived, not authored). */
  refinery: refinerySignalsSchema.nullable(),
  /** The wire spec this card was READ from (`chara_card_v2`/`chara_card_v3`) so export round-trips it (V2→V2,
   *  V3→V3). Absent for app-authored / V1 / Pygmalion cards — export then defaults to V3. Serde-boundary only
   *  today (no backing `characters` column yet — the residual-first pattern), so a DB round-trip normalizes
   *  to V3; V3-native content (`assets`/`nickname`/…) still survives the DB via the `residualData` column. */
  spec: cardSpecSchema.optional(),
});
export type CharacterCard = z.infer<typeof characterCardSchema>;

// The ONE schema the tRPC router AND the import normalizer validate against. Pipeline-derived `refinery`
// is NOT here. null clears a field; omit to leave it unchanged.
export const createCharacterSchema = z.object({
  // The card-slug WIRE boundary: length-validated, then branded (`CharacterHandle`, the identity-VALUE
  // brand `characters.handle` carries) — every consumer downstream of the parse is nominally typed.
  handle: z
    .string()
    .min(HANDLE_MIN)
    .max(HANDLE_MAX)
    .transform((v) => castId<CharacterHandle>(v)),
  name: cardFaceFields.name,
  description: cardFaceFields.description,
  personality: z.string().max(TEXT_MAX).nullable().optional(),
  scenario: z.string().max(TEXT_MAX).nullable().optional(),
  greetings: z.array(greetingSchema).max(GREETINGS_MAX).nullable().optional(),
  exampleMessages: z.string().max(TEXT_MAX).nullable().optional(),
  systemPrompt: z.string().max(TEXT_MAX).nullable().optional(),
  postHistoryInstructions: z.string().max(TEXT_MAX).nullable().optional(),
  creatorNotes: z.string().max(TEXT_MAX).nullable().optional(),
  creator: z.string().max(CREATOR_MAX).nullable().optional(),
  cardVersion: z.string().max(CARD_VERSION_MAX).nullable().optional(),
  nickname: z.string().max(NICKNAME_MAX).nullable().optional(),
  source: z.array(z.string().max(TEXT_MAX)).max(SOURCE_MAX).nullable().optional(),
  creationDate: z.number().int().nullable().optional(),
  modificationDate: z.number().int().nullable().optional(),
  // NO `regexScripts` (D121-E): a character does not carry scripts by value, so the CREATE input has no
  // slot for them. The import path reads them off the PARSED CARD and hands them to the regex domain's lift
  // op (which mints library rows + the `character_regex_scripts` attachment) — the `importLorebook` shape.
  extensions: z.record(z.string(), z.unknown()).nullable().optional(),
  residualData: z.record(z.string(), z.unknown()).nullable().optional(),
  avatarAssetId: cardFaceFields.avatarAssetId.optional(),
  /** Character's Note \@ Depth — null clears it; omit to leave unchanged. */
  depthPrompt: cardDepthPromptSchema.nullable().optional(),
});
export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;

/** Clamp a string to `max` (null/undefined pass through) — the string half of the import repair. */
function clampStr<T extends string | null | undefined>(v: T, max: number): T {
  return typeof v === "string" && v.length > max ? (v.slice(0, max) as T) : v;
}

/**
 * Best-effort REPAIR of an imported card candidate BEFORE validation: clamp over-cap strings and oversized
 * arrays to the contract limits so a foreign card with a too-long field (a novella stuffed in
 * `character_version`, a hundred-and-one greetings) still imports instead of being rejected outright. This is
 * the "repair, then isolate" boundary posture — structural/type defects it cannot fix fall through to the
 * import loop's per-card isolation (skip + count, never abort the batch).
 *
 * IMPORT-ONLY: the tRPC create/update path does NOT call this — a user editing their own card must see the
 * real limit, not a silent truncation. Lives here, beside the caps + `createCharacterSchema`, so the repair
 * and the limits it clamps to can never drift.
 */
export function repairImportedCardInput(input: z.input<typeof createCharacterSchema>): z.input<typeof createCharacterSchema> {
  return {
    ...input,
    personality: clampStr(input.personality, TEXT_MAX),
    scenario: clampStr(input.scenario, TEXT_MAX),
    exampleMessages: clampStr(input.exampleMessages, TEXT_MAX),
    systemPrompt: clampStr(input.systemPrompt, TEXT_MAX),
    postHistoryInstructions: clampStr(input.postHistoryInstructions, TEXT_MAX),
    creatorNotes: clampStr(input.creatorNotes, TEXT_MAX),
    creator: clampStr(input.creator, CREATOR_MAX),
    cardVersion: clampStr(input.cardVersion, CARD_VERSION_MAX),
    nickname: clampStr(input.nickname, NICKNAME_MAX),
    greetings: Array.isArray(input.greetings)
      ? input.greetings.slice(0, GREETINGS_MAX).map((g) => ({ ...g, text: clampStr(g.text, TEXT_MAX) }))
      : input.greetings,
    source: Array.isArray(input.source) ? input.source.slice(0, SOURCE_MAX).map((s) => clampStr(s, TEXT_MAX)) : input.source,
  };
}

export const updateCharacterSchema = createCharacterSchema.partial().extend({
  starred: cardFaceFields.starred.optional(),
  archived: z.boolean().optional(),
  forbidExternalMedia: z.boolean().nullable().optional(),
  /** Tri-state: null = inherit the deployment default, true = HTML renders TRUSTED, false = force untrusted. */
  trustHtml: z.boolean().nullable().optional(),
  /** `undefined` = leave unchanged; `null` = clear (inherit global theme); a value = set it. */
  themeOverride: themeOverrideSchema.nullable().optional(),
  /** BG-C — the carried card BACKGROUND source (the `themeOverride` twin). `undefined` = leave unchanged;
   *  `null` = clear (no card background); a value = set it. Applies only in a true-solo room, below the
   *  chat-set override (resolution is client-side in the app-shell background resolver). */
  backgroundOverride: themeBackgroundSchema.nullable().optional(),
});
export type UpdateCharacterInput = z.infer<typeof updateCharacterSchema>;

// The library-list page bounds — ONE home, because the transport enforces the ceiling and the verb applies
// the default, and a second spelling of either lets the two disagree.
//
// THE CEILING IS LOUD, NOT SILENT (2026-08-09). It used to be a `Math.min` inside the verb: four callers
// asked for 200-500 rows to build id→name/portrait LOOKUP MAPS, silently got 100, and quietly under-covered
// a 320-character library — the chats list simply stopped resolving portraits past the hundredth card, with
// nothing anywhere saying so. The router now REFUSES an over-ceiling ask (a wire-level BAD_REQUEST naming
// the bound), so an ask that cannot be served fails where it is written instead of being answered wrong.
// 500 is the ceiling those lookup callers need; the right long-term shape for them is a read that carries
// the seats it is about (a chat row naming its own portraits) rather than a whole-library map.
export const CHARACTER_LIST_DEFAULT_LIMIT = 50;
export const CHARACTER_LIST_MAX_LIMIT = 500;

// Each sort needs its own keyset, so the wire cursor is discriminated by `sort`. Default = `recent`.
// `bestScore`/`worstScore` read the derived refinery signal (`characters.refinery.score`, 1-10), which is
// NULL until something scores the card — so both directions sink the unscored tail LAST (an unscored card is
// not "the worst", it is unjudged; the `mostChats`/`fewestChats` null-group precedent).
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
  "bestScore",
  "worstScore",
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
  z.object({
    sort: z.literal("bestScore"),
    /** `null` = the boundary row has no refinery score yet (the NULLS-LAST tail). Not an int: the refinery
     *  rubric is a weighted average (`refineryScorePayloadSchema.overallScore`). */
    score: z.number().nullable(),
    id: typeIdSchema(ID_PREFIX.character),
  }),
  z.object({
    sort: z.literal("worstScore"),
    /** `null` = the boundary row has no refinery score yet (the NULLS-LAST tail) — see `bestScore`. */
    score: z.number().nullable(),
    id: typeIdSchema(ID_PREFIX.character),
  }),
]);
export type CharacterListCursor = z.infer<typeof characterListCursorSchema>;

// The ST card wire object — a V2/V3 SUPERSET (`spec` accepts either; V3-additive fields are optional so a
// V2 card validates as "V3 with the extras absent"). `.loose()` keeps unknown vendor keys riding through.
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
    // V3-additive lorebook fields. `use_regex` marks the entry's keys as regex (ST keys are always regex).
    // Decorators are NOT a wire field — V3 embeds them as `@@`-prefixed lines INSIDE `content`, so they ride
    // through verbatim with the content (no separate column). `.catch` keeps a malformed value non-throwing.
    use_regex: z.boolean().optional().catch(undefined),
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
    // ── V3-additive `data.*` fields (a V2 card omits them ⇒ all optional). Each carries `.catch` so a
    // malformed real-world value is dropped rather than throwing the strict OUT `.parse` (these ride in via
    // the `residualData` passthrough, which is untrusted). A well-formed value round-trips unchanged. ──
    /** Media manifest — PARSED + PRESERVED only (round-trips on `residualData`); no consumer materializes
     *  its URIs into local storage yet — there is no card-media fetch/download path built anywhere. */
    assets: z.array(cardAssetSchema).optional().catch(undefined),
    /** Prompt-facing display name overriding `{{char}}`. */
    nickname: z.string().optional().catch(undefined),
    /** Per-language creator notes, keyed by language code. */
    creator_notes_multilingual: z.record(z.string(), z.string()).optional().catch(undefined),
    /** Provenance URLs / ids the card was sourced from. */
    source: z.array(z.string()).optional().catch(undefined),
    /** Greetings offered ONLY in group chats. */
    group_only_greetings: z.array(z.string()).optional().catch(undefined),
    /** Unix-seconds authorship timestamps. */
    creation_date: z.number().optional().catch(undefined),
    modification_date: z.number().optional().catch(undefined),
    // PD-144: orbweaver-namespaced attached-book REFERENCES (never the book content). Optional so every
    // existing/foreign card stays valid; validated on the OUT boundary so a malformed ref fails loud.
    orbweaver_attached_books: z.array(attachedBookRefSchema).optional(),
  })
  .loose();

export const characterCardV3Schema = z
  .object({
    // A V2/V3 superset: accept either spec marker (`spec_version` stays a free string — ST V3 allows 3.x).
    spec: cardSpecSchema,
    spec_version: z.string(),
    data: characterCardV3DataSchema,
  })
  .loose();
// biome-ignore-end lint/style/useNamingConvention: ST Character-Card-V3 wire field names (snake_case)

/** The ST V3 card object the serde emits/parses (the shape `buildCardV3` returns + `writeCardChunk` writes). */
export type CharacterCardV3 = z.infer<typeof characterCardV3Schema>;
