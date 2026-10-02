// @orb/contracts/discovery — the cross-boundary vocabulary of the discovery (library-semantics) domain.
// Pure wire snapshots and vocabulary; no domain, database or Node I/O.
//
// The dedup `relation` is shared with database persistence. The duplicate-pair rollup (the `find-duplicates`
// workload) labels each near-identical CHAT pair as a genuine accidental look-alike (`duplicate`) vs a
// known fork-lineage family (`forked` — chats sharing a `chats.parentChatId` fork root, D27). Promoted
// here (it was a local tuple in `@orb/db/schema/discovery`) so the `duplicate_chat_pairs.relation` column
// DERIVES it + CHECK-enforces it + a `.int` test-mirror pins the two — the D34 one-home rule, mirroring
// `IMAGE_LENSES` in `@orb/contracts/embeddings`. Characters have NO fork lineage (D28 snapshots), so only
// `duplicate_chat_pairs` carries the column; `duplicate_character_pairs` has none.

import type { CharacterId, ChatId, DuplicateCharacterPairId, DuplicateChatPairId, MessageId, ThemeClusterId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import type { TokenProvenance } from "../chat/messages.ts";
import { tokenProvenanceSchema } from "../chat/messages.ts";
import type { CorpusDigestSource } from "../search/source.ts";
import { corpusDigestSourceSchema } from "../search/source.ts";
import type { ArchetypeMember, ThemeRow } from "./artifacts.ts";
import { themeRowSchema } from "./artifacts.ts";
import type { ThemeLevel } from "./vocabulary.ts";
import { THEME_LEVELS } from "./vocabulary.ts";

export const RELATIONS = ["duplicate", "forked"] as const;
export type DuplicateRelation = (typeof RELATIONS)[number];
export const duplicateRelationSchema = z.enum(RELATIONS) satisfies z.ZodType<DuplicateRelation>;

/** The page CEILING for every discovery top-N read (`similarChats`, `swipeHotspots`, `forgottenGems`,
 *  `topKeywords`, `cooccurringKeywords`, `characterKeywords`, `duplicate*`, `browseCharacters`), enforced at
 *  the transport trust boundary (the `CHARACTER_LIST_MAX_LIMIT` precedent). These are top-N analytics over a
 *  GROWING library (characters/keywords/chats), and the domain verbs page an unbounded SQL `.limit()`, so an
 *  over-bound ask is a BAD_REQUEST rather than the #45-class unbounded fetch. Generous: clients ask ≤ ~40. */
export const DISCOVERY_LIST_MAX_LIMIT = 500;

/** The node CEILING for the `similarityGraph` read (`maxNodes`), enforced at the transport trust boundary.
 *  Unlike the top-N reads above this is an ALL-PAIRS in-RAM projection (O(n²)), so an unbounded `maxNodes`
 *  is a self-DoS: the verb defaults to 120 highest-degree characters; this caps an over-ask rather than
 *  letting a huge library project a quadratic graph. Generous over the 120 default, bounded for the O(n²). */
export const DISCOVERY_GRAPH_MAX_NODES = 500;

// ── The distilled-catalog BROWSE page (the corpus LIST pane's rest state) ────────────────────────────
// KEYSET-PAGED, and that is A8's fix (side-eye corpus re-pass 2026-08-19). The read used to answer ONE
// truncating array capped at 200: the pane's header printed `CORPUS 313` off `catalog.totalDistilled` while
// the list below it ended at "Imai" with no load-more, so 113 of the owner's characters were unreachable and
// nothing on the surface said so. Serving all 313 instead would have fixed today's library and re-broken at
// the next one — the whole point of the `character.list` keyset is that the payload stops being a function
// of how much the user owns. So: a page + a cursor + the server's own census, the SAME three fields the
// character library's collection surface already consumes.

/** `recent` = collected-date descending; `name` = card name ascending. Discovery browse is content-only.
 *  Homed HERE rather than in the domain (it moved 2026-08-19 with the cursor): the cursor schema below is a
 *  WIRE shape discriminated on this axis, and re-spelling the two members beside it is exactly the doubling
 *  §5.5 forbids. The domain re-exports the type. */
export const BROWSE_SORTS = ["recent", "name"] as const;
export type BrowseSort = (typeof BROWSE_SORTS)[number];
export const browseSortSchema = z.enum(BROWSE_SORTS) satisfies z.ZodType<BrowseSort>;

/** The browse page size when the caller names none. Small enough that the corpus pane's first paint is one
 *  short page, large enough that a scroll past it is rare — the `VirtualList` tail-fetch covers the rest. */
export const BROWSE_DEFAULT_LIMIT = 60;

/** The browse keyset, discriminated by `sort` — a cursor minted under one ordering is REFUSED under
 *  another rather than silently mis-applied (the `characterListCursorSchema` precedent, which is where this
 *  shape comes from). `characterId` is the tie-break: `createdAt` and `name` are both non-unique, and a
 *  keyset on a non-unique column alone drops or repeats rows across the page boundary. */
export const browseCursorSchema = z.discriminatedUnion("sort", [
  z.object({
    sort: z.literal("recent"),
    createdAt: z.number().int(),
    characterId: typeIdSchema(ID_PREFIX.character),
  }),
  z.object({
    sort: z.literal("name"),
    name: z.string(),
    characterId: typeIdSchema(ID_PREFIX.character),
  }),
]);
export type BrowseCursor = z.infer<typeof browseCursorSchema>;

/** The `suggestCharacterTags` REFUSAL discriminator — the card carries no content beyond its `Name:` line,
 *  so there is nothing to distill and any facets would be invented from the name alone. Homed here (not in
 *  the domain's `contract/errors.ts`) because BOTH ends key on the literal: the server error class rides it
 *  as its `DomainOperationError.code` → the tRPC formatter's `data.reason`, and the client's tag-suggestion
 *  toast branches on that field — never on message text (the `TURN_ABORTED_OP_CODE` precedent). */
export const CARD_NOT_DISTILLABLE_REASON = "card_not_distillable";

// ── The discovery workloads' params + result vocabulary (the workloads junk-drawer exit: a workload's
//    params schema + result shape are authored by the OWNING domain, then correlated to the kind by
//    `@orb/contracts/workloads`). Five kinds ride these: compute-themes, distill-characters,
//    compute-cooccurrence, find-duplicates, csls. ──

/** compute-themes: the k-means theme pass. `k` is an optional per-run cluster count; precedence is
 *  param → `UserSettings.workloads.computeThemesK` → discovery's own floor, resolved in the contribution. */
export const computeThemesWorkloadParams = z.object({ k: z.number().int().positive().optional() });
export type ComputeThemesWorkloadParams = z.infer<typeof computeThemesWorkloadParams>;

/** find-duplicates: the near-dup analytics pass. `threshold` is an optional per-run raw-COSINE floor for
 *  the CHARACTER arm (0..1); precedence is param → `UserSettings.workloads.dupThreshold` → discovery's
 *  floor. The chat arm is Jaccard of segment content-hash sets — an incompatible scale — so it keeps its
 *  own floor internally and this knob never touches it. */
export const findDuplicatesWorkloadParams = z.object({ threshold: z.number().min(0).max(1).optional() });
export type FindDuplicatesWorkloadParams = z.infer<typeof findDuplicatesWorkloadParams>;

/**
 * Why a pass wrote nothing — the honest-accounting discriminator (issue #166).
 *
 * A ZERO IS NOT A SUCCESS SENTENCE. `compute-themes` clusters MEMORY DIGESTS, and a library with none ran to
 * `succeeded` with `{scanned: 0, written: 0}` and a result line reading "0 rows · 0 written" — a pass that
 * could not run at all, reported as one that ran and found nothing. Typed rather than a free-text note so the
 * client's copy is an exhaustive `Record` over this union (§5.5) instead of a server-authored sentence
 * crossing the wire.
 *
 * `no-digests` — the input plane is empty: memory has never been backfilled (or memory is disabled).
 * `no-solo-digests` — digests EXIST but every one belongs to a group room, and the passes that attribute a
 *   digest to a character read solo digests only: `compute-themes` clusters them and `compute-cooccurrence`
 *   credits their keywords (a group room's digests belong to the synthetic group character, #1467). "Run the
 *   backfill" is the wrong sentence there — it already ran (issue #558).
 * `no-embeddings` — the EMBEDDINGS plane is empty: nothing has been indexed yet. `csls` scores card vectors
 *   and `find-duplicates` compares card vectors + chat segment hashes, and all of those are written by the
 *   INDEX pass — a different job from the memory backfill the digest reasons point at, so it is a different
 *   sentence (issue #561).
 * `no-cards` — the owner's library has nothing to read yet.
 */
export const ANALYTICS_EMPTY_REASONS = ["no-digests", "no-solo-digests", "no-embeddings", "no-cards"] as const;
export type AnalyticsEmptyReason = (typeof ANALYTICS_EMPTY_REASONS)[number];

/** What every discovery analytics pass reports: rows examined, rows written, and — when it wrote nothing
 *  because its INPUT was empty rather than because there was nothing to change — why. */
export interface AnalyticsResult {
  readonly scanned: number;
  readonly written: number;
  /** Present ONLY on a pass that refused for want of input. Absent on a real zero-change run. */
  readonly emptyReason?: AnalyticsEmptyReason;
}

export type { Archetype, ArchetypeMember, ModelRoutingRow, ThemeRow, VisualArchetype } from "./artifacts.ts";
export { archetypeMemberSchema, archetypeSchema, modelRoutingRowSchema, themeRowSchema, visualArchetypeSchema } from "./artifacts.ts";
// The PROSE-1 discovery slot table (the three whole side-generation system prompts) — `#prose` imports it
// to compose `PROSE_SLOTS`.
export { DISCOVERY_PROSE_SLOTS } from "./prose.ts";
export type { ThemeLevel } from "./vocabulary.ts";
export { THEME_LEVELS } from "./vocabulary.ts";

const [recentCursor, nameCursor] = browseCursorSchema.options;
const browseCursorOutputSchema = z.discriminatedUnion("sort", [recentCursor.strict(), nameCursor.strict()]);

// ── near-duplicate characters ─────────────────────────────────────────────────
/** One owner-scoped near-duplicate character pair (canonical `A<B`). `similarity` is the raw cosine;
 *  `cslsScore` is the hub-adjusted rank key (`2·cos − hub_a − hub_b`). */
export interface DuplicateCharacterPair {
  readonly id: DuplicateCharacterPairId;
  readonly characterIdA: CharacterId;
  readonly characterIdB: CharacterId;
  readonly nameA: string;
  readonly nameB: string;
  readonly similarity: number;
  readonly cslsScore: number;
  readonly model: string;
  readonly computedAt: number;
}

/** One owner-scoped near-duplicate chat pair (canonical `A<B`). `similarity` is the Jaccard overlap of the
 *  two chats' segment content-hash sets, not centroid cosine. `relation` is `forked` vs `duplicate`. */
export interface DuplicateChatPair {
  readonly id: DuplicateChatPairId;
  readonly chatIdA: ChatId;
  readonly chatIdB: ChatId;
  readonly titleA: string | null;
  readonly titleB: string | null;
  readonly similarity: number;
  readonly cslsScore: number;
  readonly relation: DuplicateRelation;
  readonly model: string;
  readonly computedAt: number;
}

/** The `distillCharacters` pass summary. `failed` and `skipped` are DIFFERENT outcomes and must not be
 *  summed into one "didn't work" bucket: `failed` = the summarizer was asked and produced nothing usable
 *  (transient — re-run it); `skipped` = the card was never asked, because it carries no writing beyond its
 *  name (permanent until the user writes the card — the on-demand arm refuses it outright). */
export interface DistillStats {
  readonly scanned: number;
  readonly distilled: number;
  readonly failed: number;
  readonly skipped: number;
  readonly tagsStaged: number;
}

// ── browse (the filterable distilled catalog) ──────────────────────────────────────
/** One row of the owner's distilled character catalog — card identity plus distilled facets, content-only. */
export interface BrowseCharacter {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly genre: string | null;
  readonly tone: string | null;
  readonly setting: string | null;
  readonly tags: string[];
  readonly elevatorPitch: string | null;
  readonly avatarHash: string | null;
  readonly createdAt: number;
}

/**
 * ONE PAGE of the distilled catalog + the boundary to ask for the next one + the server's own census of the
 * whole filtered scope (A8, side-eye corpus re-pass 2026-08-19).
 *
 * `totalCount` is a SEPARATE count over the same predicate, never `items.length`: the pane prints "how many
 * there are" beside a list that holds "how many are loaded", and deriving one from the other is exactly the
 * lie that let a 200-row array sit under a header reading 313. `nextCursor` is `null` at the tail — a page
 * shorter than the ask cannot have a next one.
 */
export interface BrowseCharactersPage {
  readonly items: BrowseCharacter[];
  readonly nextCursor: BrowseCursor | null;
  readonly totalCount: number;
}

/** One facet value + how many of the owner's distilled cards carry it (populates a filter dropdown). */
export interface FacetCount {
  readonly value: string;
  readonly count: number;
}

/** The distinct genres + tones in the owner's distilled corpus, each with its card count (descending). */
export interface CharacterFacets {
  readonly genres: FacetCount[];
  readonly tones: FacetCount[];
}

// ── archetypes (k-means over card embeddings, labelled from distilled facets — no LLM) ──────────────────

/** One point in the corpus "galaxy" — a character's card embedding projected to 2D (PCA). */
export interface CorpusPoint {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly genre: string | null;
  readonly x: number;
  readonly y: number;
}

// ── similarity (character graph + similar chats — discovery-native in-RAM, zero search) ─────────────────
/** One node in the character similarity graph — a kept (dense-core) character. `degree` is its edge count. */
export interface SimilarityGraphNode {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly degree: number;
  readonly genre: string | null;
}

/** One edge — a character pair whose raw card-embedding cosine cleared `minSimilarity`. */
export interface SimilarityGraphEdge {
  readonly source: CharacterId;
  readonly target: CharacterId;
  readonly similarity: number;
}

/** The character similarity graph — dense-core nodes (highest-degree, capped) + edges between kept nodes. */
export interface SimilarityGraph {
  readonly nodes: SimilarityGraphNode[];
  readonly edges: SimilarityGraphEdge[];
}

/** One "more like THIS chat" hit — a chat whose segment centroid is nearest the target chat's centroid. */
export interface SimilarChat {
  readonly chatId: ChatId;
  readonly title: string | null;
  readonly similarity: number;
}

// ── cooccurrence (keyword×keyword tallies; per-character keyword profiles) ──────────────────────────────
/** One keyword + its count (a `topKeywords` / `characterKeywords` / `cooccurringKeywords` row). */
export interface KeywordCount {
  readonly keyword: string;
  readonly count: number;
}

// ── catalog / compare (distill-powered analytics over character_summaries; SQL, no LLM) ─────────────────
/** One distilled tag + how many of the owner's cards carry it (case-folded). */
export interface TagCount {
  readonly tag: string;
  readonly count: number;
}

/** Two distilled tags that co-occur on the same card + how often. Canonical `a < b` (case-folded). */
export interface TagPair {
  readonly a: string;
  readonly b: string;
  readonly count: number;
}

/** The distill-powered catalog overview — what the owner actually collected, content-only. */
export interface CatalogStats {
  readonly genres: FacetCount[];
  readonly tones: FacetCount[];
  readonly topTags: TagCount[];
  readonly tagPairs: TagPair[];
  readonly totalDistilled: number;
  /** THE BASE `totalDistilled` IS OUT OF (issue #535, the one-pass denominator rule). Every corpus surface
   *  that prints the distilled count reads THIS payload — the LIST band, the CONTEXT band, the browse
   *  view — and each printed a bare `313` beside an overview whose h1 said `320 characters`. Two true
   *  numbers of two different things, neither naming the other, in one frame. The catalog is the read all
   *  four share, so the denominator travels WITH the numerator rather than being joined per surface off a
   *  heavier overview read (`discovery.home`) that a LIST band has no other reason to hold. */
  readonly totalCharacters: number;
}

/** One side of a `compareCharacters` diff — the card identity + its headline distilled facets. */
export interface ComparedCharacter {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly genre: string | null;
  readonly tone: string | null;
  readonly pitch: string | null;
}

/** A two-character facet diff (no LLM) — shared vs distinct tags + a redundancy signal (tag Jaccard). */
export interface CharacterComparison {
  readonly a: ComparedCharacter;
  readonly b: ComparedCharacter;
  readonly sameGenre: boolean;
  readonly sameTone: boolean;
  readonly sharedTags: string[];
  readonly onlyA: string[];
  readonly onlyB: string[];
  readonly redundancy: number;
}

// ── analyze (LLM-narrated comparison + card Q&A; the semantic-understanding half) ───────────────────────
/** The grounded LLM narrative decorating {@link CharacterComparison} — a prose read of the facet diff.
 *
 *  `degraded` is the DEGRADE-AS-DATA channel (the only honest way out of a validation failure that still
 *  returns something): `false` = the model's reply validated and the three fields are real. `true` = it failed
 *  the payload schema on both the first turn and the bounded retry, so `summary` carries the RAW reply verbatim
 *  and `overlap`/`distinction` are empty. A renderer MUST branch on it — without the flag, unparseable model
 *  output reads as a finished narrative beside two blank sections, which is a lie by omission. */
export interface ComparisonNarrative {
  readonly summary: string;
  readonly overlap: string;
  readonly distinction: string;
  readonly degraded: boolean;
}

/** {@link CharacterComparison} plus a grounded LLM narrative over the same diff (`compareCharactersDeep`). */
export interface CharacterComparisonDeep extends CharacterComparison {
  readonly narrative: ComparisonNarrative;
}

/** A grounded answer to a free-text question about ONE owned/distilled character — answered from its recent
 *  PLAYED scenes ONLY (SEMANTIC content, never economics). `sampledMessages` is how many scenes it saw.
 *
 *  The two boolean fields are DIFFERENT claims by DIFFERENT authors and must not be read as one:
 *  • `grounded` — the MODEL'S own claim that its answer is supported by the sampled scenes. Only meaningful
 *    when `degraded` is false; a degraded answer carries no model claim at all, so it reports `false` as the
 *    safe floor rather than a judgment.
 *  • `degraded` — OURS: the reply failed the payload schema twice, so `answer` is the raw text verbatim.
 *  A renderer that shows "Speculative" for a degraded answer is attributing our parse failure to the model. */
export interface AskCardAnswer {
  readonly characterId: CharacterId;
  readonly question: string;
  readonly answer: string;
  readonly grounded: boolean;
  readonly degraded: boolean;
  readonly sampledMessages: number;
}

// ── swipes (regeneration hotspots — the assistant slots with the most alternate takes) ──────────────────
/** One "swipe hotspot" — an assistant message slot with multiple variants (a spot the owner re-rolled).
 *  `variantCount` is how many takes exist; `snippet` is the SELECTED variant's content (SEMANTIC only). */
export interface SwipeHotspot {
  readonly messageId: MessageId;
  readonly seq: number;
  readonly characterId: CharacterId;
  readonly characterName: string;
  readonly variantCount: number;
  readonly snippet: string;
}

// ── insights (pure-semantics half: themeDrift + unusedCharacters) ───────────────────────────────────────
/** One theme's prevalence within a story-time month bucket. `themeName` is null below the name-worthiness floor. */
export interface ThemeDriftTheme {
  readonly clusterIdx: number;
  readonly themeName: string | null;
  readonly count: number;
}

/** How the owner's themes shift over story time — per-month theme prevalence, bucket-ascending. */
export interface ThemeDriftBucket {
  readonly bucket: string;
  readonly themes: ThemeDriftTheme[];
}

// ── insights (economics-composed half: forgottenGems + modelRouting) ──────────────────────
/** A "forgotten gem" — a character with real invested message volume gone quiet. `tokensOut`/`costUsd` are
 *  sourced from the injected `stats` op, never a raw `messages` sum in discovery. */
export interface ForgottenGem {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly avatarHash: string | null;
  readonly messageCount: number;
  readonly lastActiveAt: number;
  /** `null` = NO output-token accounting exists for this character — either stats has no row for it at all,
   *  or every contributing generation remains unrecorded. NOT the same fact as a zero,
   *  and the shelf renders the two differently (side-eye corpus re-pass B2). */
  readonly tokensOut: number | null;
  /** Origin of `tokensOut`; estimates remain approximate across the stats → discovery seam. */
  readonly tokensOutProvenance: TokenProvenance;
  /** `null` = no selected variant reported a dollar cost. */
  readonly costUsd: number | null;
}

// ── composed views (content-only server verbs — home + themeDetail) ─────────────────────────────────────
/** Corpus coverage — how much of the owner's library is indexed (not usage). */
interface CorpusCoverage {
  readonly characters: number;
  readonly digests: number;
  readonly segments: number;
}

/**
 * The corpus home view — index coverage + the scene/arc theme clusters + near-duplicate counts.
 *
 * THE THEME LISTS ARE COMPLETE, not a top-N (2026-08-18): they were `topSceneThemes`/`topArcThemes`, sliced
 * to 8, beside a non-interactive bar chart that drew ALL of them. The chart is gone (it duplicated the rows
 * and could not be clicked), so the rows are now the ONE place a theme is met and a truncated list would
 * have deleted half of them from the surface. The list is bounded by the k-means k, not by the library.
 *
 * `duplicateCounts.identicalCharacterPairs` is the near-dup pass's BLIND SPOT, counted at read time: the
 * pass scans content-hash-collapsed representatives, so byte-identical cards can never form a pair and two
 * cosine-1.00 same-name pairs sat one tab away from a rail reading "1 found". The collapse is correct for
 * the clustering passes it was written for; the READOUT is what was wrong, so the count is derived here
 * rather than by changing what the pass writes.
 */
export interface HomeView {
  readonly coverage: CorpusCoverage;
  readonly sceneThemes: ThemeRow[];
  readonly arcThemes: ThemeRow[];
  readonly duplicateCounts: { readonly characters: number; readonly chats: number; readonly identicalCharacterPairs: number };
}

/** One character's presence in a theme cluster (its digest count in the cluster). */
export interface ThemeMember {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly count: number;
}

/** One neighbour in a `characterDossier` — a discovery-local projection of search's `similarCharacters`
 *  (injected cross-domain at the root). Deliberately NOT search's `CharacterCardHit` — the search shape stays
 *  out of the discovery contract; discovery owns this narrowed neighbour view. `score` is search's CSLS unit
 *  (a clamped DISTANCE, for ranking only); `relevance` is the cosine similarity the dossier RENDERS — five of
 *  the eight neighbours on the live library read `0.00` under the old readout precisely because they were the
 *  closest matches in the library (corpus forensics §3). */
export interface DossierNeighbor {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly score: number;
  readonly relevance: number;
  readonly avatarHash: string | null;
  readonly genre: string | null;
  readonly tone: string | null;
  readonly elevatorPitch: string | null;
}

/** One character's composed dossier — its distilled headline facets + portrait↔card alignment (in-RAM
 *  cosine) + nearest neighbours (the injected search seam). `portrait` is null when the character has no
 *  paired card/avatar vector; `similar` is empty when search has no neighbours. */
export interface CharacterDossier {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly genre: string | null;
  readonly tone: string | null;
  readonly elevatorPitch: string | null;
  readonly tags: string[];
  readonly portrait: { readonly avatarHash: string; readonly alignment: number } | null;
  /** The refinery's card-quality score (`characters.refinery.score`, the 1-10 rubric), or `null` when
   *  nothing has scored this card yet — a library score sweep or a refinery session fills it. Read here
   *  rather than fetched separately by the surface: the dossier IS the "everything we understand about this
   *  character" view, and a second round-trip for one scalar the same join already passes over is waste. */
  readonly refineryScore: number | null;
  readonly similar: DossierNeighbor[];
}

/** One theme's detail view — the cluster row + its story-time timeline + the characters most present in it. */
export interface ThemeDetail {
  readonly sources: readonly CorpusDigestSource[];
  readonly sourceLimit: number;
  readonly computedAt: number;
  readonly id: ThemeClusterId;
  readonly level: ThemeLevel;
  readonly clusterIdx: number;
  readonly name: string | null;
  readonly size: number;
  readonly model: string;
  readonly timeline: { readonly bucket: string; readonly count: number }[];
  readonly members: ThemeMember[];
}

// ── image analytics (avatar-lens: duplicates / visual archetypes / portrait alignment / caption facets) ──
/** One pair of cards sharing near-identical art (reused/duplicate avatars). `similarity` is the raw
 *  image↔image cosine. */
export interface ImageDuplicatePair {
  readonly characterIdA: CharacterId;
  readonly nameA: string;
  readonly characterIdB: CharacterId;
  readonly nameB: string;
  readonly similarity: number;
}

/** One character's portrait↔card cross-modal alignment (paired in-RAM cosine). Low = art doesn't match writing. */
export interface PortraitAlignment {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly avatarHash: string | null;
  readonly alignment: number;
  readonly rating: string | null;
  readonly artStyle: string | null;
}

/** The portrait-alignment report — every scored character (worst-matched art first) + the distribution. */
export interface PortraitAlignmentReport {
  readonly count: number;
  readonly mean: number;
  readonly median: number;
  readonly characters: PortraitAlignment[];
}

/** The VL-breakdown facet distributions over the owner's current-avatar corpus. */
export interface ImageFacets {
  /** Avatars carrying an actual breakdown — the denominator every distribution below is over. */
  readonly total: number;
  /** Avatars carrying a caption, analysed or not. `captioned > total` is the honest "captioned before the
   *  breakdown pass existed" coverage state; the two were conflated until issue #164, which is how a
   *  confident "79 images" printed above fourteen empty bar-lists. */
  readonly captioned: number;
  readonly artStyles: FacetCount[];
  readonly palettes: FacetCount[];
  readonly moods: FacetCount[];
  readonly ratings: FacetCount[];
  readonly shotTypes: FacetCount[];
  readonly cameraAngles: FacetCount[];
  readonly genders: FacetCount[];
  readonly coverage: FacetCount[];
  readonly bodyTypes: FacetCount[];
  readonly chestSizes: FacetCount[];
  readonly skinTones: FacetCount[];
  readonly outfitTypes: FacetCount[];
  readonly clothingStates: FacetCount[];
  readonly nudityLevels: FacetCount[];
  readonly exposedParts: FacetCount[];
  readonly topTags: FacetCount[];
}

/** One character behind a facet chip — the drill from a facet value to its avatars. */
export interface ImageFacetMember {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly avatarHash: string | null;
  readonly rating: string | null;
  readonly artStyle: string | null;
  readonly caption: string | null;
}

/** Character identity for the never-played filter; the producer decides eligibility. */
export type UnusedCharacter = ArchetypeMember;

export const duplicateCharacterPairSchema = z.strictObject({
  id: typeIdSchema(ID_PREFIX.duplicateCharacterPair),
  characterIdA: typeIdSchema(ID_PREFIX.character),
  characterIdB: typeIdSchema(ID_PREFIX.character),
  nameA: z.string(),
  nameB: z.string(),
  similarity: z.number(),
  cslsScore: z.number(),
  model: z.string(),
  computedAt: z.number(),
}) satisfies z.ZodType<DuplicateCharacterPair>;

export const duplicateChatPairSchema = z.strictObject({
  id: typeIdSchema(ID_PREFIX.duplicateChatPair),
  chatIdA: typeIdSchema(ID_PREFIX.chat),
  chatIdB: typeIdSchema(ID_PREFIX.chat),
  titleA: z.string().nullable(),
  titleB: z.string().nullable(),
  similarity: z.number(),
  cslsScore: z.number(),
  relation: duplicateRelationSchema,
  model: z.string(),
  computedAt: z.number(),
}) satisfies z.ZodType<DuplicateChatPair>;

export const distillStatsSchema = z.strictObject({
  scanned: z.number(),
  distilled: z.number(),
  failed: z.number(),
  skipped: z.number(),
  tagsStaged: z.number(),
}) satisfies z.ZodType<DistillStats>;

export const browseCharacterSchema = z.strictObject({
  characterId: typeIdSchema(ID_PREFIX.character),
  name: z.string(),
  genre: z.string().nullable(),
  tone: z.string().nullable(),
  setting: z.string().nullable(),
  tags: z.array(z.string()),
  elevatorPitch: z.string().nullable(),
  avatarHash: z.string().nullable(),
  createdAt: z.number(),
}) satisfies z.ZodType<BrowseCharacter>;

export const browseCharactersPageSchema = z.strictObject({
  items: z.array(browseCharacterSchema),
  nextCursor: browseCursorOutputSchema.nullable(),
  totalCount: z.number(),
}) satisfies z.ZodType<BrowseCharactersPage>;

export const facetCountSchema = z.strictObject({ value: z.string(), count: z.number() }) satisfies z.ZodType<FacetCount>;

export const characterFacetsSchema = z.strictObject({
  genres: z.array(facetCountSchema),
  tones: z.array(facetCountSchema),
}) satisfies z.ZodType<CharacterFacets>;

export const corpusPointSchema = z.strictObject({
  characterId: typeIdSchema(ID_PREFIX.character),
  name: z.string(),
  genre: z.string().nullable(),
  x: z.number(),
  y: z.number(),
}) satisfies z.ZodType<CorpusPoint>;

export const similarityGraphNodeSchema = z.strictObject({
  characterId: typeIdSchema(ID_PREFIX.character),
  name: z.string(),
  degree: z.number(),
  genre: z.string().nullable(),
}) satisfies z.ZodType<SimilarityGraphNode>;

export const similarityGraphEdgeSchema = z.strictObject({
  source: typeIdSchema(ID_PREFIX.character),
  target: typeIdSchema(ID_PREFIX.character),
  similarity: z.number(),
}) satisfies z.ZodType<SimilarityGraphEdge>;

export const similarityGraphSchema = z.strictObject({
  nodes: z.array(similarityGraphNodeSchema),
  edges: z.array(similarityGraphEdgeSchema),
}) satisfies z.ZodType<SimilarityGraph>;

export const similarChatSchema = z.strictObject({
  chatId: typeIdSchema(ID_PREFIX.chat),
  title: z.string().nullable(),
  similarity: z.number(),
}) satisfies z.ZodType<SimilarChat>;

export const keywordCountSchema = z.strictObject({ keyword: z.string(), count: z.number() }) satisfies z.ZodType<KeywordCount>;

export const tagCountSchema = z.strictObject({ tag: z.string(), count: z.number() }) satisfies z.ZodType<TagCount>;

export const tagPairSchema = z.strictObject({ a: z.string(), b: z.string(), count: z.number() }) satisfies z.ZodType<TagPair>;

export const catalogStatsSchema = z.strictObject({
  genres: z.array(facetCountSchema),
  tones: z.array(facetCountSchema),
  topTags: z.array(tagCountSchema),
  tagPairs: z.array(tagPairSchema),
  totalDistilled: z.number(),
  totalCharacters: z.number(),
}) satisfies z.ZodType<CatalogStats>;

export const comparedCharacterSchema = z.strictObject({
  characterId: typeIdSchema(ID_PREFIX.character),
  name: z.string(),
  genre: z.string().nullable(),
  tone: z.string().nullable(),
  pitch: z.string().nullable(),
}) satisfies z.ZodType<ComparedCharacter>;

export const characterComparisonSchema = z.strictObject({
  a: comparedCharacterSchema,
  b: comparedCharacterSchema,
  sameGenre: z.boolean(),
  sameTone: z.boolean(),
  sharedTags: z.array(z.string()),
  onlyA: z.array(z.string()),
  onlyB: z.array(z.string()),
  redundancy: z.number(),
}) satisfies z.ZodType<CharacterComparison>;

export const comparisonNarrativeSchema = z.strictObject({
  summary: z.string(),
  overlap: z.string(),
  distinction: z.string(),
  degraded: z.boolean(),
}) satisfies z.ZodType<ComparisonNarrative>;

export const characterComparisonDeepSchema = characterComparisonSchema.extend({
  narrative: comparisonNarrativeSchema,
}) satisfies z.ZodType<CharacterComparisonDeep>;

export const askCardAnswerSchema = z.strictObject({
  characterId: typeIdSchema(ID_PREFIX.character),
  question: z.string(),
  answer: z.string(),
  grounded: z.boolean(),
  degraded: z.boolean(),
  sampledMessages: z.number(),
}) satisfies z.ZodType<AskCardAnswer>;

export const swipeHotspotSchema = z.strictObject({
  messageId: typeIdSchema(ID_PREFIX.message),
  seq: z.number(),
  characterId: typeIdSchema(ID_PREFIX.character),
  characterName: z.string(),
  variantCount: z.number(),
  snippet: z.string(),
}) satisfies z.ZodType<SwipeHotspot>;

export const themeDriftThemeSchema = z.strictObject({
  clusterIdx: z.number(),
  themeName: z.string().nullable(),
  count: z.number(),
}) satisfies z.ZodType<ThemeDriftTheme>;

export const themeDriftBucketSchema = z.strictObject({ bucket: z.string(), themes: z.array(themeDriftThemeSchema) }) satisfies z.ZodType<ThemeDriftBucket>;

export const forgottenGemSchema = z.strictObject({
  characterId: typeIdSchema(ID_PREFIX.character),
  name: z.string(),
  avatarHash: z.string().nullable(),
  messageCount: z.number(),
  lastActiveAt: z.number(),
  tokensOut: z.number().nullable(),
  tokensOutProvenance: tokenProvenanceSchema,
  costUsd: z.number().nullable(),
}) satisfies z.ZodType<ForgottenGem>;

const corpusCoverageSchema = z.strictObject({ characters: z.number(), digests: z.number(), segments: z.number() }) satisfies z.ZodType<CorpusCoverage>;

export const homeViewSchema = z.strictObject({
  coverage: corpusCoverageSchema,
  sceneThemes: z.array(themeRowSchema),
  arcThemes: z.array(themeRowSchema),
  duplicateCounts: z.strictObject({ characters: z.number(), chats: z.number(), identicalCharacterPairs: z.number() }),
}) satisfies z.ZodType<HomeView>;

export const themeMemberSchema = z.strictObject({
  characterId: typeIdSchema(ID_PREFIX.character),
  name: z.string(),
  count: z.number(),
}) satisfies z.ZodType<ThemeMember>;

export const dossierNeighborSchema = z.strictObject({
  characterId: typeIdSchema(ID_PREFIX.character),
  name: z.string(),
  score: z.number(),
  relevance: z.number(),
  avatarHash: z.string().nullable(),
  genre: z.string().nullable(),
  tone: z.string().nullable(),
  elevatorPitch: z.string().nullable(),
}) satisfies z.ZodType<DossierNeighbor>;

export const characterDossierSchema = z.strictObject({
  characterId: typeIdSchema(ID_PREFIX.character),
  name: z.string(),
  genre: z.string().nullable(),
  tone: z.string().nullable(),
  elevatorPitch: z.string().nullable(),
  tags: z.array(z.string()),
  portrait: z.strictObject({ avatarHash: z.string(), alignment: z.number() }).nullable(),
  refineryScore: z.number().nullable(),
  similar: z.array(dossierNeighborSchema),
}) satisfies z.ZodType<CharacterDossier>;

export const themeDetailSchema = z.strictObject({
  sources: z.array(corpusDigestSourceSchema).readonly(),
  sourceLimit: z.number(),
  computedAt: z.number(),
  id: typeIdSchema(ID_PREFIX.themeCluster),
  level: z.enum(THEME_LEVELS),
  clusterIdx: z.number(),
  name: z.string().nullable(),
  size: z.number(),
  model: z.string(),
  timeline: z.array(z.strictObject({ bucket: z.string(), count: z.number() })),
  members: z.array(themeMemberSchema),
}) satisfies z.ZodType<ThemeDetail>;

export const imageDuplicatePairSchema = z.strictObject({
  characterIdA: typeIdSchema(ID_PREFIX.character),
  nameA: z.string(),
  characterIdB: typeIdSchema(ID_PREFIX.character),
  nameB: z.string(),
  similarity: z.number(),
}) satisfies z.ZodType<ImageDuplicatePair>;

export const portraitAlignmentSchema = z.strictObject({
  characterId: typeIdSchema(ID_PREFIX.character),
  name: z.string(),
  avatarHash: z.string().nullable(),
  alignment: z.number(),
  rating: z.string().nullable(),
  artStyle: z.string().nullable(),
}) satisfies z.ZodType<PortraitAlignment>;

export const portraitAlignmentReportSchema = z.strictObject({
  count: z.number(),
  mean: z.number(),
  median: z.number(),
  characters: z.array(portraitAlignmentSchema),
}) satisfies z.ZodType<PortraitAlignmentReport>;

export const imageFacetsSchema = z.strictObject({
  total: z.number(),
  captioned: z.number(),
  artStyles: z.array(facetCountSchema),
  palettes: z.array(facetCountSchema),
  moods: z.array(facetCountSchema),
  ratings: z.array(facetCountSchema),
  shotTypes: z.array(facetCountSchema),
  cameraAngles: z.array(facetCountSchema),
  genders: z.array(facetCountSchema),
  coverage: z.array(facetCountSchema),
  bodyTypes: z.array(facetCountSchema),
  chestSizes: z.array(facetCountSchema),
  skinTones: z.array(facetCountSchema),
  outfitTypes: z.array(facetCountSchema),
  clothingStates: z.array(facetCountSchema),
  nudityLevels: z.array(facetCountSchema),
  exposedParts: z.array(facetCountSchema),
  topTags: z.array(facetCountSchema),
}) satisfies z.ZodType<ImageFacets>;

export const imageFacetMemberSchema = z.strictObject({
  characterId: typeIdSchema(ID_PREFIX.character),
  name: z.string(),
  avatarHash: z.string().nullable(),
  rating: z.string().nullable(),
  artStyle: z.string().nullable(),
  caption: z.string().nullable(),
}) satisfies z.ZodType<ImageFacetMember>;

export const analyticsResultSchema = z
  .strictObject({ scanned: z.number(), written: z.number(), emptyReason: z.enum(ANALYTICS_EMPTY_REASONS).optional() })
  .transform(({ emptyReason, ...view }) => ({ ...view, ...(emptyReason !== undefined ? { emptyReason } : {}) })) satisfies z.ZodType<AnalyticsResult>;
