// The DOM id the LIST panel's landmark is named BY — one constant, two consumers: the `<aside>` that points
// at it (`app-shell/components/panel-chrome.tsx`) and the band heading that carries it
// (`components/list-pane-header.tsx`).
//
// WHY THE LANDMARK STOPPED CARRYING A STATIC NAME (#493, side-eye 2026-08-22 rail-characters P2-3): the
// shell named the aside `"<section> list"` from the ACTIVE SECTION, so it could only ever describe the
// section — and the Characters LIST pane swaps its whole contents to a character's CHATS when one is opened
// (the projection design's D2 arm). The visible band followed (`CHATS · SABINE VEYRA`); the landmark did
// not, so navigating by landmark announced "Characters list, complementary" over a chat roster.
//
// Naming the landmark by its OWN VISIBLE HEADING is the fix that cannot rot: whatever a section's band says,
// the landmark says. It needs no per-section wiring, no second vocabulary, and no new required field on
// `SectionDefinition` — and it is the same principle as the row fix one file over, that the accessible name
// is the visible text rather than a parallel string.
//
// A FIXED id is safe here BECAUSE `ListPaneHeader` renders in exactly one place: the `listHeader` slot of
// the LIST panel (verified across all eight sections that declare one — no context-panel or second
// in-page use). One list panel exists at a time, so the id cannot collide with itself.
//
// The shell keeps its `aria-label` as the FALLBACK, and that is load-bearing rather than belt-and-braces:
// a section whose band is not a `ListPaneHeader` (refinery) renders no such heading, and per the accessible
// name computation an `aria-labelledby` that resolves to nothing falls through to `aria-label`.

/** The `<h2>` the LIST panel's `aria-labelledby` points at — the band's own visible title. */
export const LIST_PANE_TITLE_ID = "orb-list-pane-title";
