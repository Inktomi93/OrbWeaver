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
