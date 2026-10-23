// fuzzy-search front door — the minisearch browse-search seal (the second sanctioned minisearch
// home beside macro-textarea). `fuzzySearch` is the DOM-free core; `useFuzzySearch` the memoized
// hook every library/browse surface composes with its collection surface.

export { fuzzySearch, useFuzzySearch } from "./fuzzy-search.ts";
