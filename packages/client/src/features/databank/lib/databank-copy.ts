// The Databank section's own COPY — the strings spelled in more than one place by construction.
//
// The no-selection CONTEXT arm is spelled TWICE by construction (the `features/config` precedent): the
// section definition DECLARES it (`context.empty`, which is what the shell's placeholder machinery reads)
// and the `single` context BODY renders it — only a `single` body can read its own selection, so the shell
// mounts the body unconditionally and hands it no result. One home means the two halves cannot drift into
// two different sentences for one state.

/** CONTEXT with no document open. Names what the pane WILL show — never the word "Details" (the band
 *  already says that) and never a section-less "select something" (side-eye F-12). */
export const DATABANK_CONTEXT_EMPTY = {
  title: "Where a document fires",
  description: "Open a document to switch it on everywhere, and to see which chats and characters it already feeds.",
} as const;
