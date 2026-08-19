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
 *  THE PROMISE IS A ROSTER AGAIN — because the read landed (#276, 2026-08-19). The full arc, both halves
 *  recorded: it originally promised "…to see WHICH chats and characters it already feeds" over a pane that
 *  rendered two dead count Badges, and side-eye 2026-08-19 P1 correctly downgraded it, because a promise of
 *  names paid in integers reads as a broken pane. That downgrade named its own wake condition — the wire was
 *  `{ global, chatIds, characterIds }` (ids, no names) and the roster was "blocked on a real read, not on
 *  layout". `databank.listAttachments` now returns named rooms (through chat's leak-safe
 *  `resolveVisibleRooms`, so only rooms the reader may open) and named characters, each one a door. The
 *  sentence tracks the pane's real contract in BOTH directions; it never described a pane that could not
 *  pay it. */
export const DATABANK_CONTEXT_EMPTY = {
  title: "Where a document fires",
  description: "Open a document to switch it on everywhere, and to see which chats and characters it already feeds.",
} as const;
