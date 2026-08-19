// The Databank section's own COPY — the strings spelled in more than one place by construction.
//
// The no-selection CONTEXT arm is spelled TWICE by construction (the `features/config` precedent): the
// section definition DECLARES it (`context.empty`, which is what the shell's placeholder machinery reads)
// and the `single` context BODY renders it — only a `single` body can read its own selection, so the shell
// mounts the body unconditionally and hands it no result. One home means the two halves cannot drift into
// two different sentences for one state.

/** WHAT A DOCUMENT IS FOR, in one sentence — the teaching gloss every "you have nothing / add something"
 *  surface prints. ONE home because it had FOUR drifted spellings (side-eye 2026-08-08 P2-c): the add
 *  dialog's description, the library pane's empty state, the CONTENT welcome and home's databank tile each
 *  taught the same mechanism in slightly different words, so the product said "get indexed" in one place,
 *  "chunked and embedded" in another and "indexed once" in a third. A user meeting two of them cannot tell
 *  whether they describe one mechanism or two. Surfaces that need MORE than this add their own second
 *  sentence after it (the CONTENT welcome does) — they never re-word this one. */
export const DATABANK_INGEST_GLOSS =
  "Upload a file, paste text, or pull in a page — its contents get indexed so the most relevant passages feed into your chats as they happen.";

/** CONTEXT with no document open. Names what the pane WILL show — never the word "Details" (the band
 *  already says that) and never a section-less "select something" (side-eye F-12).
 *
 *  THE PROMISE IS A COUNT, NOT A ROSTER (side-eye 2026-08-19 P1). It used to say "…to see WHICH chats and
 *  characters it already feeds", over a pane that renders two dead count Badges. A promise of names paid in
 *  integers is worse than either half alone: the reader arrives at "3 chats" believing the pane failed,
 *  rather than reading the number it actually offers. The COUNT is what `databank.listAttachments` can
 *  honestly serve today — its wire is `{ global, chatIds, characterIds }` (ids, no names), and the roster
 *  the old sentence promised is blocked on a real read, not on layout (see `databank-context-body.tsx`'s
 *  ACTIVE IN note for the scope constraint and what a named roster would cost). So the sentence downgrades
 *  to the pane's real contract; the roster promise comes back the day the read does. */
export const DATABANK_CONTEXT_EMPTY = {
  title: "Where a document fires",
  description: "Open a document to switch it on everywhere, and to see how many chats and characters it reaches.",
} as const;
