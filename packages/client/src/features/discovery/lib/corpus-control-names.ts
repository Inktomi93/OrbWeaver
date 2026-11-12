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
