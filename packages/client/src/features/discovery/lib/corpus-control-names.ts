// The accessible names the Corpus list and browse view print. A zero-import leaf, so a spec's node side reads them without
// loading the component graph.

/** The Corpus search target select. */
export const CORPUS_SEARCH_TARGET_NAME = "Search target";

/** The browse view's catalog region. */
export const CORPUS_DISTILLED_CATALOG_NAME = "Distilled catalog";
export const CORPUS_MODE_NAME = "Corpus mode";
export const CORPUS_SEARCH_NAME = "Search your corpus";

/** What a meaning-search target prints when it answers nothing. */
export const CORPUS_NO_RESULT_TEXT = "No result in this preview.";

/** What the text target prints when no card wording matched `query`. */
export function corpusLexicalNoMatchText(label: string, query: string): string {
  return `Nothing in your ${label.toLowerCase()} matched “${query}”.`;
}

/** The result list's live announcement: how many rows it renders, for which target, and whether none matched strongly. */
export function corpusResultsStatusText(count: number, label: string, nearestOnly: boolean): string {
  const noun = count === 1 ? "result" : "results";
  return nearestOnly ? `${count} nearest ${noun} in ${label}: nothing matched strongly` : `${count} ${noun} in ${label}`;
}

/** The Explore overview's shelf of invested but quiet characters, each tile a door to that character's dossier. */
export const CORPUS_GEM_TILES_NAME = "Invested but quiet characters";

/** The Explore overview's list of model routes, each row a door to that route's artifact. */
export const CORPUS_MODEL_ROUTES_NAME = "Model routes";

/** The door to the overview where a library is sorted, on every pane that waits on it. */
export const CORPUS_SORTING_DOOR_NAME = "Go to sorting";

/** What each readiness rail row calls its pass, keyed by the stage id `CORPUS_READINESS_STAGE_IDS` lists. */
export const CORPUS_STAGE_LABELS = {
  families: "Visual families",
  distilled: "Distilled: genre, tone, pitch",
  storyThemes: "Story themes",
  keywords: "Keywords",
  duplicates: "Near-duplicates",
} as const;

/** The Corpus context band's tabs. Explore's analysis tabs and the subject's evidence tab. */
export const CORPUS_CONTEXT_TAB_LABELS = {
  evidence: "Evidence",
  archetypes: "Archetypes",
  visuals: "Visuals",
  map: "Map",
  similarity: "Similarity",
  compare: "Compare",
} as const;

/** The parameter selects of the Archetypes and Similarity tabs and of the browse view. */
export const CORPUS_PARAM_NAMES = {
  clusters: "Clusters",
  minSimilarity: "Min similarity",
  sort: "Sort",
  genre: "Genre",
  setting: "Setting",
} as const;

/** The Corpus home's kicker over its headline. */
export const CORPUS_UNDERSTANDING_HEADING = "Library understanding";

/** A readiness row's datum for a pass that ran and found nothing. */
export const CORPUS_NONE_FOUND_TEXT = "none found";

/** A browse facet's option: the value and how many characters carry it. */
export function corpusFacetOptionLabel(value: string, count: number): string {
  return `${value} (${String(count)})`;
}

/** What a browse row says in place of an elevator pitch when its card has no distilled facet. */
export const CORPUS_NOT_DISTILLED_TEXT = "Not distilled";

/** The Similarity tab's line when no pair clears the threshold. */
export const CORPUS_NO_SIMILARITY_EDGES_TEXT = "No similarity edges at this threshold.";

/** The press that opens a search result's coverage note. */
export const CORPUS_SEARCH_DISCLOSURE_NAME = "How search works";

/** The readiness rail's list of analysis passes. */
export const CORPUS_READINESS_RAIL_NAME = "Analysis passes";

/** A readiness row's door to Chat memory when its pass reads chat summaries and memory is off. */
export const CORPUS_TURN_ON_MEMORY_NAME = "Turn on chat memory";

/** The line of a pass only the box owner may run. */
export const CORPUS_BOX_OWNER_RUNS_PASS_TEXT = "The box owner runs this pass";

/**
 * What each corpus read is called in its failure line, `queryFailedLabel(CORPUS_READ_LABELS.x)`. One entry per read a
 * spec makes fail; a surface passes its entry to `QueryErrorState`.
 */
export const CORPUS_READ_LABELS = {
  archetypes: "archetypes",
  artArchetypes: "the art archetypes",
  writingArchetypes: "the writing archetypes",
  catalogFilters: "your catalog filters",
  similarityGraph: "the similarity graph",
  neverPlayedCharacters: "your never-played characters",
  modelUsage: "your model usage",
  topKeywords: "your top keywords",
  storyThemeDrift: "story-theme drift",
  similarArt: "the similar art",
  comparison: "that comparison",
  search: "the search",
} as const;
