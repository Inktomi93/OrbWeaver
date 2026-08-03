// The Configuration host's own COPY — the strings the host (never a contribution) owns.
//
// Its own module because the no-selection context arm is spelled TWICE by construction: the section
// definition DECLARES it (`context.empty`, which is what the shell's band/placeholder machinery reads) and
// the `single` context body RENDERS it (only a `single` body can read its own selection). One home means
// the two halves cannot drift into two different sentences for one state.

/** CONTEXT with nothing selected. Distinct from a collection's `{kind:"none"}` copy, which says the
 *  opposite thing: there something IS selected and simply has nothing to attach. */
export const CONFIG_CONTEXT_EMPTY = {
  title: "Nothing selected",
  description: "Pick something on the left and this panel shows where it applies.",
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
