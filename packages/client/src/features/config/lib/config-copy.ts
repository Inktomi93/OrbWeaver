// The Configuration host's own COPY — the strings the host (never a contribution) owns.
//
// Its own module because the no-selection context arm is spelled TWICE by construction: the section
// definition DECLARES it (`context.empty`, which is what the shell's band/placeholder machinery reads) and
// the `single` context body RENDERS it (only a `single` body can read its own selection). One home means
// the two halves cannot drift into two different sentences for one state.

/** The workspace's TEACHING FRAME — the surface's one opening statement and the sentence under it.
 *
 * IT HOMES HERE BECAUSE IT IS SPOKEN TWICE BY CONSTRUCTION, exactly like the context-empty arm above: the
 * desktop CONTENT renders it as the section's teaching frame (it used to sit over the launcher hearth, which
 * #1210 retired), and the mobile LIST renders it as a header over the list — two panes, because on a phone
 * CONTENT is unreachable until something is selected and the welcome was therefore structurally invisible to
 * a cold reader (side-eye 2026-08-19 P2, "the teaching frame never renders on a phone"). Two spellings of
 * one frame is how the phone ends up taught something the desktop is not.
 *
 * ONE VOICE, NOT TWO, on the mobile side as well: the sentence is true for a reader with an empty library
 * and for one with 1736 tags, so neither surface switches copy on a corpus census. */
export const CONFIG_WELCOME = {
  title: "The parts every chat is built from",
  teaching:
    "Tags label your library. Regex scripts rewrite text on its way in or out. World books hold the lore your characters draw on. Nothing here is required, and nothing here is spent once: build a part, then attach it wherever you need it.",
} as const;

/** The section's rail label AND its LIST band title (owner fork F-9, 2026-08-30): the id stays `config`, the
 *  word says what the surface holds now that the settings modal retired into it. ONE home for both. */
export const CONFIG_SECTION_LABEL = "Settings";

/** CONTEXT with nothing selected. Distinct from a collection's `{kind:"none"}` copy, which says the
 *  opposite thing: there something IS selected and simply has nothing to attach. */
export const CONFIG_CONTEXT_EMPTY = {
  title: "Nothing selected",
  description: "Pick something from the list and this panel shows where it applies.",
} as const;

/** THE ONE PHRASE FOR "this part of the app does not exist yet" (#925 ruling 2 · #1043). It marks the LIST
 *  row of a `{ placeholder: true }` group and the chip on the body that row opens — two surfaces, one claim,
 *  one spelling. It is a statement about the APP, never about the reader's data: a library with nothing in
 *  it is a built feature with an empty count, and the welcome band that used these words for that state was
 *  the misread this ruling deletes. Nothing outside the placeholder arm may borrow the phrase. */
export const CONFIG_UNBUILT_MARKER = "Not built yet";

// THE HOST'S ONE SENTENCE ABOUT ITS OWN GEOMETRY IS GONE (#1725, owner ruling 2026-09-05).
// `CONFIG_COLLECTION_LANDING.hint` read "Pick one from the list to open its editor." — the host's fact about
// WHERE a library's members live, beside the contribution's facts about what the library IS. The owner moved
// the members into the same pane the sentence was written on, so the sentence became a direction to the pane
// the reader is standing in. It is deleted rather than reworded because its whole JOB was to point somewhere
// else: with the rows immediately below the control row, a line restating that they are there is the
// affordance-shaped text #1209 already removed from this surface. Its one reader
// (`config-collection-landing.tsx`) is the library host now, and the approved board 02 draws no sentence in
// that position. The stickler's "replace, do not delete" is answered by the ROWS, not by a second string.

/** THE ONE WORD FOR "this differs from its default" (#1099 F16 / Errand A). Every surface that marks the
 *  state spells it from here — the search result row, the LIST's group band, the shelf — so the marks a
 *  reader meets while hunting one changed setting cannot read as three different claims. It is the word
 *  the `@modified` token already teaches ("only settings that differ from their default"). */
export const CONFIG_MODIFIED_MARKER = "Modified";

/** THE ROW'S SAVE-FAILED MARK (SET-SEAMS §3). Rides the SAME `meta` slot {@link CONFIG_MODIFIED_MARKER}
 *  does, on the SAME precedence `config-list-group.tsx`'s `SubcategoryRow` states in code
 *  (`erroredSubIds.has(sub.id) ? saveFailedMarker : modified`) — never both at once.
 *
 *  #1712 (owner default, 2026-09-05): a section whose save FAILED already differs from its stored default —
 *  the failed write is, definitionally, the unsaved non-default value the user was trying to commit — so
 *  this state IMPLIES {@link CONFIG_MODIFIED_MARKER} even though the row shows only this word. That is
 *  DELIBERATE, not an omission: a composed "Save failed · Modified" mark was considered and is the
 *  documented alternative (#1712's compose arm), refused here because the row already grows exactly ONE
 *  state slot and `config-list-surface.ct.tsx`'s row-pitch measurement is what a SECOND visible marker on
 *  this row costs (a modified row's box grows past its siblings' — see `SubcategoryRow`'s own doc). The
 *  implication is pinned, not silent: `appearance-group.ct.tsx`'s failing-save test drives a section whose
 *  value differs from its default AND fails to save, and asserts the nav marker reads exactly this word. */
export const SAVE_FAILED_MARKER = "Save failed";
