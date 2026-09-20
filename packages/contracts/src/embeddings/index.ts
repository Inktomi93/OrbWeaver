// `@orb/contracts/embeddings` — the IMAGE-lens axis, promoted here so `@orb/db` can derive its
// `image_embeddings.lens` enum column (it cannot import a server-tier `domain/*/contract/`).
// Scope: only the image subset of the domain's broader `SourceLens` — text lenses (`card-text`/
// `segment`/`digest`) route to distinct tables, not this column, so they aren't re-spelled here.

import { z } from "zod";

/** The two complementary lenses through which an avatar image is embedded, both in the one 1024-dim
 *  space. `image-raw` = pure visual signal, no caption/text influence. `image-captioned` = image bytes
 *  + the generated caption string. Both coexist per asset (`unique(assetId, model, lens)`). */
export const IMAGE_LENSES = ["image-raw", "image-captioned"] as const;

export type ImageLens = (typeof IMAGE_LENSES)[number];

export const imageLensSchema = z.enum(IMAGE_LENSES);

/** Why the image indexer REFUSED to caption+embed an asset — a durable, attributable skip-record (the
 *  `image_index_skips.reason` column derives this tuple, as `lens` does IMAGE_LENSES). Promoted here so
 *  `@orb/db` can build the column's `{ enum }` + CHECK without importing a server-tier `domain/<x>/contract/`.
 *
 *  `below-dimension-floor` is the admission floor: an asset whose header-parsed shorter edge is under the
 *  indexer's minimum (`substrate/image-admission`) carries no visual signal — a 1×1 tracking-pixel or
 *  placeholder — so captioning + embedding it would burn VL/embed compute and write a degenerate vector
 *  into the retrieval + discovery substrate. Recorded (not silently skipped) so the content-hash self-heal
 *  never re-attempts it every pass and so the refusal is visible/attributable. It is a TUPLE, not a bare
 *  string, so a future reason (a corrupt/unparseable asset, say) is a tsc error at every consumer that has
 *  not handled it (§5.5 dispatch discipline). */
export const IMAGE_SKIP_REASONS = ["below-dimension-floor"] as const;

export type ImageSkipReason = (typeof IMAGE_SKIP_REASONS)[number];

/** The four INDEPENDENTLY-SWEPT halves of an owner's vector corpus — the granularity at which "the reindex
 *  finished" is a true statement (inference program §10-5, the `activeSpace` getter).
 *
 *  It is four and not two because a `(model[@dtype])` space change fires FOUR separate sweeps, each with its
 *  own workload, its own abort and its own failure mode: `cards` (`embeddings.embedCorpus`), `memory` (chat's
 *  memory backfill), `documents` (the `databank-reindex` chunk-embed pass) and `images`
 *  (`embeddings.embedAssets`). Three of them write the `embed` space and one writes `imageEmbed`, so a
 *  per-TASK completion flag would have to claim "the embed space is complete" while a third of it is still in
 *  the old geometry. `embed_space_state` therefore keys one row per `(owner, scope)` and
 *  {@link VECTOR_SCOPES_BY_TASK} folds them back up.
 *
 *  Promoted here — not into a server-tier `contract/` — for the D34 reason `IMAGE_LENSES` is here:
 *  `@orb/db` derives the `embed_space_state.scope` `{ enum }` + CHECK from this tuple and cannot import a
 *  domain. A fifth vector surface is a tsc error at {@link VECTOR_SCOPES_BY_TASK} until it names its task. */
export const VECTOR_SCOPES = ["cards", "memory", "documents", "images"] as const;

export type VectorScope = (typeof VECTOR_SCOPES)[number];

/** Which scopes make up each vector task's space. The fold the `activeSpace` getter runs: a task's space is
 *  COMPLETE only when every one of its scopes has recorded the same tag, because a retrieval over `embed`
 *  scans cards, memory AND document chunks in one geometry. */
export const VECTOR_SCOPES_BY_TASK: Readonly<Record<"embed" | "imageEmbed", readonly VectorScope[]>> = {
  embed: ["cards", "memory", "documents"],
  imageEmbed: ["images"],
};

/** One `embed_space_state` row, as both readers select it. */
export interface CompletedSpaceRow {
  readonly scope: VectorScope;
  readonly space: string;
}

/** WHERE a task's corpus actually IS, folded from its scopes' completion rows (§10-5).
 *
 *  THREE STATES, and collapsing any two of them is a defect:
 *   • `unrecorded` — some scope of this task has never completed a sweep (a virgin box, or a corpus that
 *     predates the state table). Everything that exists was written in the live space, so the live space is
 *     the only answer there is and a reader serves it.
 *   • `complete` — every scope agrees. Equal to the live space in the steady state.
 *   • `moving` — the scopes DISAGREE: a reindex is in flight and part of the corpus has already moved.
 *     Indistinguishable from `unrecorded` if both are spelled `null`, which would make a reader serve the
 *     live space mid-move — exactly the scan that returns confidently-ranked garbage. */
export type ActiveSpace = { readonly kind: "unrecorded" } | { readonly kind: "complete"; readonly space: string } | { readonly kind: "moving" };

/** THE `activeSpace` FOLD (§10-5). Deriving it here, beside the tuple, is what stops a second reader from
 *  folding it a second way; it lives in contracts because the table's WRITER (`domain/embeddings`) and its
 *  READER (`domain/search`) may not import each other. */
export function foldActiveSpace(task: keyof typeof VECTOR_SCOPES_BY_TASK, rows: readonly CompletedSpaceRow[]): ActiveSpace {
  const spaces = VECTOR_SCOPES_BY_TASK[task].map((scope) => rows.find((row) => row.scope === scope)?.space);
  const first = spaces[0];
  if (spaces.some((space) => space === undefined) || first === undefined) {
    return { kind: "unrecorded" };
  }
  return spaces.every((space) => space === first) ? { kind: "complete", space: first } : { kind: "moving" };
}

// ── The VL image breakdown (`image_embeddings.caption_meta`) ──────────────────────────────────────────
//
// WHY THIS LIVES IN CONTRACTS AND NOT IN EITHER DOMAIN. `caption_meta` is a domain↔domain wire column:
// EMBEDDINGS writes it (the one avatar-analysis call, `indexer/caption.ts`) and DISCOVERY reads it
// (`image-analytics/facets.ts` tallies it, `image-analytics/retrieve.ts` labels visual families from it,
// `charactersByImageFacet` drills it through allowlisted json paths). Neither may import the other, so the
// vocabulary has exactly one home below both — the §0.2 cross-boundary-shape rule.
//
// WHY THE FACETS ARE CLOSED ENUMS, NOT FREE TEXT. Every consumer is a DISTRIBUTION: a facet explorer, a
// json_extract drill, and the visual-family labeler's lift-over-baseline comparison. Free-text art styles
// would produce ~one bucket per image — a histogram with no signal and a drill that never matches twice.
// The enums are also the guided-decode grammar (`projectJsonSchema` → `responseFormat`), so the model is
// CONSTRAINED to the vocabulary rather than trusted to stay inside it.
//
// PROVENANCE (2026-08-18, issue #164): before this module existed, both write sites stored
// `{ model: <summarizerModel> }` and NOTHING else, while the reader declared fourteen facet paths. The
// tally therefore returned every array empty on a 101-image corpus, and `visualArchetypes` — whose label
// prefers `artStyle · mood` — fell through to its `tone genre` arm and labelled PORTRAIT-embedding clusters
// with CARD-TEXT genre/tone. Three of eight families rendered the identical "wholesome slice-of-life".
// The layer that was missing was never the looking (the captions are specific and correct); it was the
// structured breakdown. Do not re-introduce a caption-only write path.

/** Whether a facet is a single value (`json_extract` equality) or a set (`json_each` membership). Discovery's
 *  drill derives its per-facet SQL from this split, so a new facet without a nature is a tsc error there. */
export const IMAGE_FACET_NATURES = ["scalar", "list"] as const;
export type ImageFacetNature = (typeof IMAGE_FACET_NATURES)[number];

/** Rendering technique. `other` is the escape hatch that keeps the model from forcing a wrong bucket. */
export const IMAGE_ART_STYLES = [
  "anime",
  "semi-realistic",
  "photorealistic",
  "painterly",
  "illustration",
  "cartoon",
  "pixel-art",
  "3d-render",
  "sketch",
  "comic",
  "abstract",
  "other",
] as const;

/** Dominant colour character of the frame. */
export const IMAGE_PALETTES = ["warm", "cool", "neutral", "vibrant", "muted", "monochrome", "pastel", "dark", "high-contrast"] as const;

/** The emotional read of the IMAGE — never of the card's writing (that axis is `character_summaries.tone`). */
export const IMAGE_MOODS = ["cheerful", "serene", "melancholic", "menacing", "sensual", "playful", "tense", "wistful", "triumphant", "neutral"] as const;

/** Overall content rating of the frame. */
export const IMAGE_RATINGS = ["safe", "suggestive", "explicit"] as const;

/** How much of the subject the frame contains. */
export const IMAGE_SHOT_TYPES = ["portrait", "bust", "half-body", "full-body", "close-up", "wide"] as const;

/** Where the camera sits relative to the subject. */
export const IMAGE_CAMERA_ANGLES = ["eye-level", "low-angle", "high-angle", "dutch", "overhead", "profile", "from-behind"] as const;

/** The subject's presented gender. `none` = no figure in frame (an object, a scene, a logo). */
export const IMAGE_GENDERS = ["female", "male", "androgynous", "non-human", "group", "none"] as const;

/** How much skin the outfit leaves covered — the WARDROBE axis. */
export const IMAGE_COVERAGES = ["fully-covered", "mostly-covered", "partially-exposed", "mostly-exposed", "uncovered"] as const;

export const IMAGE_BODY_TYPES = ["slim", "average", "athletic", "curvy", "heavy", "petite", "muscular", "non-human", "not-applicable"] as const;

export const IMAGE_CHEST_SIZES = ["flat", "small", "medium", "large", "very-large", "not-applicable"] as const;

export const IMAGE_SKIN_TONES = ["pale", "fair", "tan", "olive", "brown", "dark", "non-human", "not-applicable"] as const;

export const IMAGE_OUTFIT_TYPES = [
  "casual",
  "formal",
  "armor",
  "uniform",
  "swimwear",
  "lingerie",
  "traditional",
  "streetwear",
  "fantasy",
  "none",
  "other",
] as const;

/** The wardrobe's STATE, orthogonal to what it is (`outfitType`) and how much it covers (`coverage`). */
export const IMAGE_CLOTHING_STATES = ["intact", "disheveled", "partially-removed", "removed", "not-applicable"] as const;

/** Explicitness of exposure — the graded axis behind the coarse `rating`. */
export const IMAGE_NUDITY_LEVELS = ["none", "suggestive", "partial", "full"] as const;

/** Body regions the frame leaves bare — a SET facet (an image can show several). */
export const IMAGE_EXPOSED_PARTS = ["shoulders", "midriff", "cleavage", "back", "legs", "thighs", "chest", "buttocks", "genitals", "feet"] as const;

/** Every facet key a breakdown carries, with its nature. The ONE canonical member list — discovery's drill
 *  axis and the tally both derive from it, so adding a facet here is a tsc error at every consumer that has
 *  not handled it (§5.5 dispatch discipline). */
export const IMAGE_FACET_NATURE_BY_KEY = {
  artStyle: "scalar",
  palette: "scalar",
  mood: "scalar",
  rating: "scalar",
  shotType: "scalar",
  cameraAngle: "scalar",
  gender: "scalar",
  coverage: "scalar",
  bodyType: "scalar",
  chestSize: "scalar",
  skinTone: "scalar",
  outfitType: "scalar",
  clothingState: "scalar",
  nudityLevel: "scalar",
  exposedParts: "list",
  tags: "list",
} as const satisfies Record<string, ImageFacetNature>;

export type ImageFacetMetaKey = keyof typeof IMAGE_FACET_NATURE_BY_KEY;

const MIN_IMAGE_TAGS = 3;
const MAX_IMAGE_TAGS = 8;

/**
 * ONE image's structured VL breakdown — the payload the avatar-analysis call is guided-decoded into AND the
 * shape stored under `image_embeddings.caption_meta` (spread beside its `model` provenance).
 *
 * `caption` rides the SAME call rather than a second one: the sentence and the facets are one look at one
 * image, and splitting them would double the GPU cost of every avatar for a corpus backfill.
 */
export const imageBreakdownSchema = z.object({
  /** The one-sentence human caption — also written to `image_embeddings.caption` and embedded. */
  caption: z.string(),
  artStyle: z.enum(IMAGE_ART_STYLES),
  palette: z.enum(IMAGE_PALETTES),
  mood: z.enum(IMAGE_MOODS),
  rating: z.enum(IMAGE_RATINGS),
  shotType: z.enum(IMAGE_SHOT_TYPES),
  cameraAngle: z.enum(IMAGE_CAMERA_ANGLES),
  gender: z.enum(IMAGE_GENDERS),
  coverage: z.enum(IMAGE_COVERAGES),
  bodyType: z.enum(IMAGE_BODY_TYPES),
  chestSize: z.enum(IMAGE_CHEST_SIZES),
  skinTone: z.enum(IMAGE_SKIN_TONES),
  outfitType: z.enum(IMAGE_OUTFIT_TYPES),
  clothingState: z.enum(IMAGE_CLOTHING_STATES),
  nudityLevel: z.enum(IMAGE_NUDITY_LEVELS),
  exposedParts: z.array(z.enum(IMAGE_EXPOSED_PARTS)),
  /** Free subject keywords — the ONE open facet, because a closed subject vocabulary cannot describe a
   *  library. Bounded so a degenerate reply can't write a hundred one-off buckets. */
  tags: z.array(z.string()).min(MIN_IMAGE_TAGS).max(MAX_IMAGE_TAGS),
});
export type ImageBreakdown = z.infer<typeof imageBreakdownSchema>;

/** A stored `caption_meta` blob, read back from a column that outlives any one build: `model` has always been
 *  there, every facet is OPTIONAL because the 2026-08-18 backfill boundary means older rows carry none, and
 *  unknown keys pass through (a future facet must not poison an old reader). */
export const imageCaptionMetaSchema = imageBreakdownSchema.omit({ caption: true }).partial().extend({ model: z.string().optional() }).loose();
export type ImageCaptionMeta = z.infer<typeof imageCaptionMetaSchema>;

// ── The `index` workload's terminal result (the workloads junk-drawer exit: a workload's result shape is
//    domain↔domain wire, authored by the OWNING domain — embeddings owns the ONE vector write path). ──

/** An embed pass's counts. `skipped` = rows already embedded in the active space (the resumable-by-skip
 *  arm a non-`force` run takes). */
export interface EmbedPassResult {
  readonly embedded: number;
  readonly skipped: number;
}
