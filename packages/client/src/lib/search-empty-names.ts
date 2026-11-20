// The words every searchable list prints when a search finds nothing. A zero-import leaf, so a spec's node side reads them
// without loading the component graph.

/** The empty state a search with no hits shows. */
export const NO_MATCHES_TITLE = "No matches";

/** The empty state's way out: it clears the search that emptied the list. */
export const CLEAR_SEARCH_NAME = "Clear search";

/** The same way out for a list narrowed by a local filter rather than a search. */
export const CLEAR_FILTER_NAME = "Clear filter";
