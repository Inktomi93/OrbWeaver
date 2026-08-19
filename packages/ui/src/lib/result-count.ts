// The live filtered/result-count announcement text (§13.0 litmus, C20 rollup) — the same
// `${count} result(s)` pluralization was hand-spelled in autocomplete/combobox/command's Status
// components. One home means the copy can't drift between the three announcers.
export function formatResultCount(count: number): string {
  return `${count} ${count === 1 ? "result" : "results"}`;
}

/**
 * The TYPEAHEAD's count — what an `Autocomplete` announces. Separate copy from {@link formatResultCount}
 * on purpose (side-eye corpus re-pass 2026-08-19, B3): an autocomplete's list is a set of things to TYPE,
 * not the answer to the query, and announcing it as "2 results" over a surface rendering twenty actual hits
 * told a screen-reader user the search had found two. Combobox/Command keep "results" — there the list IS
 * the result set.
 */
export function formatSuggestionCount(count: number): string {
  return `${count} ${count === 1 ? "suggestion" : "suggestions"}`;
}
