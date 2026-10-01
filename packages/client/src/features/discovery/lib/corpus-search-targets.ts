// The corpus omnibox target axis (the J10 heart) — the meaningful search surfaces a user browses their
// library through. Four ride the unified `search.search` (mapped to its `over` discriminant); one — the
// lexical "Text" target — rides `search.fields` (BM25 over card fields), a different engine, so the axis
// carries a `kind` discriminator the query builder + result renderer switch on. Deliberately a NARROW
// subset: the corpus navigator never exposes the internal retrieval targets (`entities`/`segments`/`corpus`).
//
// `lens` rides only the image target (imageLensSchema is required there). Keep this the ONE home for the
// axis — the picker, the query builder, and the result renderer all read it.

import type { ImageLens } from "@orb/contracts/embeddings";

/** The corpus omnibox targets, in picker order. `kind` selects the engine; `over` is the `search.search`
 *  discriminant for the unified targets (absent on the lexical `fields` target). */
export const CORPUS_SEARCH_TARGETS = [
  { id: "characters", label: "Characters", kind: "unified", over: "characters" },
  { id: "discover", label: "Scenes", kind: "unified", over: "discover" },
  { id: "digests", label: "Memories", kind: "unified", over: "digests" },
  { id: "images", label: "Images", kind: "unified", over: "images" },
  { id: "fields", label: "Text", kind: "fields" },
] as const;

/** One omnibox target descriptor (file-local — the exported surface is the const + the resolver). */
type CorpusSearchTarget = (typeof CORPUS_SEARCH_TARGETS)[number];

/** The omnibox target axis id (file-local — consumers resolve via `resolveSearchTarget`). */
type CorpusSearchTargetId = CorpusSearchTarget["id"];

/** The empty-query rest-state hint per target — one honest line each: WHAT the target searches and
 *  WHAT to type. The Characters target rests on the browse catalog instead of a hint, so its entry is
 *  the catalog's own framing (shown only if the catalog can't render). A mapped Record over the id
 *  union keeps this exhaustive — a new target fails `tsc`. */
export const CORPUS_TARGET_REST_HINTS: Record<CorpusSearchTargetId, string> = {
  characters: "Browse your distilled character catalog, or type a name or theme to search.",
  discover: "Search chat scenes across your library — type a line, moment, or vibe to find it.",
  digests: "Search your saved memory digests — type what you're trying to recall.",
  images: "Search your images by likeness and caption — type what an image shows. A hit opens its asset detail.",
  fields: "Lexical card search — type a name or keyword; prefix and fuzzy matches are included.",
};

/** How many hits the omnibox pulls per query — a bounded preview, not the whole ranked pool. */
export const CORPUS_SEARCH_TOP_N = 20;

/** The unified targets — the ones whose hits carry a `relevance` (the lexical `fields` target's BM25 score
 *  is not a similarity, so it has no honest band and never gets the banner). */
type UnifiedTargetId = Extract<CorpusSearchTarget, { kind: "unified" }>["id"];

/**
 * THE BAND BELOW WHICH A RESULT LIST IS ONLY "THE NEAREST THINGS" (side-eye corpus re-pass #3, P2-B).
 *
 * Cosine always answers: `zzqqxwvfoobarbaz` returned twenty rows the surface announced as results, with no
 * state in which it could say "nothing here is close". These are the numbers that make it able to say it —
 * MEASURED on the owner's live library (dev tRPC, `search.search`, topN=20, owner scope, 2026-08-19), five
 * gibberish queries + five topical queries + eight verbatim-passage queries per target:
 *
 *   target      gibberish max   coherent-but-absent   present content
 *   characters  .378–.458       .320–.368             .470–.707
 *   discover    .396–.493       .372–.446             .515–.565
 *   digests     .499–.602       .435–.473             .615–.770
 *   images      .187–.202       —                     .440–.490
 *
 * TWO THINGS THAT TABLE PROVES, both of which decided the shape of the fix:
 *
 * 1. RELEVANCE IS NOT COMPARABLE ACROSS TARGETS. Gibberish scores .20 against images and .60 against
 *    digests, so there is no single constant — the threshold is per target or it is wrong somewhere.
 * 2. A LOW SCORE IS NOT A BAD RESULT, so nothing is ever HIDDEN on this evidence. On digests a coherent
 *    off-topic query ("quarterly tax filing deadlines", .435–.473) scores BELOW gibberish (.499–.602) —
 *    query-side hubness: a nonsense embedding lands near the corpus centroid and is mildly close to
 *    everything. A hard floor calibrated to catch the reported gibberish case would therefore have hidden
 *    the off-topic case while still letting gibberish through, i.e. it fails on the exact symptom. The
 *    surface labels instead: every row still renders, under a banner that says what the number means.
 *
 * Each value sits in that target's measured gap, between its gibberish ceiling and its present-content
 * floor. They are display thresholds only — nothing here reaches the server, the ranking, or a stored value.
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export const CORPUS_NEAREST_ONLY_BELOW: Record<UnifiedTargetId, number> = {
  characters: 0.46,
  discover: 0.5,
  digests: 0.61,
  images: 0.35,
};

/** Whether a unified result set is only "the nearest things" — its best hit is no better than what a
 *  nonsense query scores against this target (see {@link CORPUS_NEAREST_ONLY_BELOW}). An empty list is
 *  never degraded: it has its own designed empty state. */
export function isNearestOnly(over: UnifiedTargetId, relevances: readonly number[]): boolean {
  return relevances.length > 0 && Math.max(...relevances) < CORPUS_NEAREST_ONLY_BELOW[over];
}

/** How many as-you-type suggestions the typeahead pulls per keystroke — the POOL the display filter draws
 *  from, deliberately wider than what is shown so dropping junk does not empty the list. */
export const CORPUS_SUGGEST_LIMIT = 8;

/** How many suggestions the typeahead RENDERS — what the shared `Autocomplete` `inline` list can show
 *  without scrolling (its box is a fixed ~4-row scroller so it can never grow this pane). Measured against
 *  the rendered box in `corpus-list-surface.ct.tsx`, not guessed. */
export const CORPUS_SUGGEST_SHOWN = 4;

/** A suggestion worth offering: it reads as a phrase. Letters/digits/marks plus the punctuation names carry
 *  (spaces, apostrophes, hyphens, periods) — and it must START on a letter or digit.
 *
 *  The suggest index is built over raw transcript tokens, so it hands back fragments like `"elf elf<"` (a
 *  torn tag) and bare punctuation runs. They are unusable as a query AND they cost one of the four rendered
 *  slots. Unicode-aware on purpose: character names here are routinely non-ASCII. */
const CLEAN_SUGGESTION_RE = /^[\p{L}\p{N}][\p{L}\p{N}\p{M} '’.-]*$/u;

/** Whether a raw server suggestion is a phrase a person could have typed (see {@link CLEAN_SUGGESTION_RE}). */
export function isCleanSuggestion(suggestion: string): boolean {
  return CLEAN_SUGGESTION_RE.test(suggestion.trim());
}

/** The image target's lens — the caption-aware avatar embedding (image bytes + generated caption). */
export const CORPUS_IMAGE_LENS: ImageLens = "image-captioned";

/** Resolve a target id to its descriptor (defaults to Characters for a stale/unknown value). */
export function resolveSearchTarget(id: string): CorpusSearchTarget {
  return CORPUS_SEARCH_TARGETS.find((t) => t.id === id) ?? CORPUS_SEARCH_TARGETS[0];
}
