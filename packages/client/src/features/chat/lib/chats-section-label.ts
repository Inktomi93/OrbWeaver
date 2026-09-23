// The Chats section's NAME, in one place. Its own module because three sites print it and they must print
// the same word: the rail entry (`chats-section.tsx`), the LIST chrome band (`components/chat-list-header.tsx`)
// and — since #1676 — the phone topbar's screen title (`lib/chats-selection-title.ts`), which is where the
// census lives when the ONE-NAME rule sheds the band's title. The `characters-section-label.ts` precedent
// (#1670), for the same reason: the third reader is what turns two hand-copied literals into a defect.

/** What every surface calls this section (`docs/law/vocabulary-map.md` renames nothing here — `Chats` is the word). */
export const CHATS_SECTION_LABEL = "Chats";
