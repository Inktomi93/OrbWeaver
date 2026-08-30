// The Configuration host's own COPY — the strings the host (never a contribution) owns.
//
// Its own module because the no-selection context arm is spelled TWICE by construction: the section
// definition DECLARES it (`context.empty`, which is what the shell's band/placeholder machinery reads) and
// the `single` context body RENDERS it (only a `single` body can read its own selection). One home means
// the two halves cannot drift into two different sentences for one state.

/** The workspace's TEACHING FRAME — the surface's one opening statement and the sentence under it.
 *
 * IT HOMES HERE BECAUSE IT IS SPOKEN TWICE BY CONSTRUCTION, exactly like the context-empty arm above: the
 * desktop WELCOME renders it over the launcher hearth (CONTENT), and the mobile LIST renders it as a header
 * over the roster — two panes, because on a phone CONTENT is unreachable until something is selected and
 * the welcome was therefore structurally invisible to a cold reader (side-eye 2026-08-19 P2, "the teaching
 * frame never renders on a phone"). Two spellings of one frame is how the phone ends up taught something
 * the desktop is not.
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

/**
 * The CONTEXT BAND's word when this workspace's pane answers NOTHING — no member open, or a member whose
 * collection has nothing to attach. Both of those arms render an `EmptyState` whose title already IS the
 * sentence, so a band echoing it printed one fact twice, ~78px apart (side-eye sweep 2026-08-03): the F-12
 * defect `registry-contracts.ts` names verbatim — "the word 'Details' twice (the band's, then the body
 * placeholder's title)" — rebuilt one tier up.
 *
 * It is deliberately the SAME word the shell shows a header-less section (`section-context-host.ts`'s
 * `CONTEXT_HEADER_DEFAULT`), because that is the frame `empty-states.html` draws for exactly these two arms:
 * band "Details" over body "Nothing to attach". It is re-spelled here rather than imported because
 * `client-features-no-cross` bars a feature from importing app-shell's — and the band cannot simply render
 * NOTHING instead: an empty `.shell-panel-header` collapses to 0px (measured), dropping the context pane's
 * band and its D66 A1 horizon with the LIST and CONTENT bands beside it.
 */
export const CONFIG_CONTEXT_BAND_NEUTRAL = "Details";
