---
kind: work
status: doing
updated: 2026-11-08
priority: P3
area: ui
lane: wt/agent-a7572929e5e574748
plan: cross-surface-consistency
---

# Dialogs and pickers P3 bundle from acceptance part 1

## What

New chat at 300% on a phone wraps the Close glyph under the title. Glass dialogs draw an inset box where opaque pinned rows sit (DialogFooter, New chat footer, command root). The desktop picker search input is 19px tall in a 32px strip. Add document's Link field is not scrolled into view in short landscape. The import preview puts primary before Cancel, unlike the dialog footers.

## Why

Each breaks the dialog family's shared composition found in acceptance.

## Done when

Each finding is fixed with a capture, or answered with a cited reason in this item's Evidence. Source: acceptance part 1 report.

## Evidence

New chat parts and the shared dialog owners, measured in a CT geometry probe (the lane report has the numbers):

- Close wrap at 300% on a phone: fixed in `packages/client/src/components/content-dialog.tsx`. A title beside Close alone floors at its longest word, so Close keeps the title's line (390x844: Close at y37 beside a two-line title, header 163px, was 253px). A landscape header still truncates its title, and so does a title its caller marks truncating (`titleTruncate`, the member card viewer): it keeps the title floor and ends in its ellipsis with Close on its line. `tests/client/components/viewer-dialog.ct.tsx` asserts that at 390x844 and 1280x844 with a long title, and is red when the word floor also takes truncating titles.
- Inset box under glass: fixed. The New chat pinned row only blurs, as `DialogFooter` already did, and a command box in a dialog takes the popup's own glass (`packages/client/src/styles/globals.css`). Measured at 1440x900: popup `oklab(0.245 … / 0.7)`, pinned row `rgba(0, 0, 0, 0)` with `blur(14px)`, command root `rgba(0, 0, 0, 0)`.
- Saved-roster door cut at 1440x900 and 300%: fixed by the stacked heading gap (the door now sits whole above the popup's foot).
- Title truncating at 568x320 and 300%: ruled. `docs/law/ui-platform-rulings.md` §8.1: a landscape phone's dialog header holds one line and its title truncates, and the full text stays the dialog's name.
- Desktop search input height: already fixed by the field-size input (2180). Measured 31px in its 32px strip at 1440x900 (the strip's hairline is the rest).
- Moved to their own items, so closing this one drops neither: the Add document Link field scroll is 2253 (`packages/client/src/features/databank/components/add-document-body.tsx`), and the import preview action order is 2254 (`packages/client/src/features/workloads/components/import-library-section.tsx`). Neither is a shared dialog owner.
