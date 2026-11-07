// The ONE derivation of "which sessions does the roster's search show". The list rows and the chrome band's census
// both answer off it, so the band never reports a roster the pane is not showing.

/** The comparable form of the search box's raw text. `""` = the rest state (every session shows). */
export function refinerySearchNeedle(query: string): string {
  return query.trim().toLowerCase();
}

/** Does a session match? Its character's name and its own name are both searchable: the list is organised by
 *  character, and the session's own name is null on most rows. */
export function matchesRefinerySearch(characterName: string, sessionName: string | null, needle: string): boolean {
  return needle === "" || characterName.toLowerCase().includes(needle) || (sessionName ?? "").toLowerCase().includes(needle);
}
