---
kind: bug
status: open
updated: 2026-11-02
priority: P2
area: client
plan: cross-surface-consistency
---

# Closeout 4 N bundle: rename field width, New chat footer at phone 200% and 300%, unnamed hand-edit checkboxes, band count on a failed read, raw error in an alert, paged group room in short landscape

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

Filled at landing: what ran and where its output is.

Source: `reports/side-eye/2026-11-01-closeout-4.md` (gitignored, on main's checkout), run on 822d61a82e. Each finding there carries its run ids.

- 3382ece657 fixed N1, N3, N4 and N5. N2 needs a compact stacked footer: dropping the list's scroller would undo the persistent footer ruling and break `CharacterPicker`'s tail loading. N6 needs a measurement pass first. F7 stays carried here.

- d41319f46f fixed N2 with a compact stacked footer. N6 and F7 stay here; the short-regime rule should close them.

- The short-room commits close N6 and F7 with one rule in `packages/client/src/styles/globals.css` (law: `docs/law/UI-Architecture-and-Layout.md` §4b axis 4). Under the 28rem height step, the member strip and Earlier messages ride in the transcript's own scroll content above the oldest row. A reader opens on the transcript; a writer's room holds its end, so Send stays above the keyboard. The side-eye review `reports/side-eye/2026-11-02-short-regime.md` (gitignored) drove the second commit.
  - N6: at 844x390, a paged group room's transcript runs from the room's top edge to the composer. With a name band pinned, the reader keeps that height less the band. Before, the strip and Earlier messages stayed fixed above it and left 74px. They now scroll away with the oldest rows and cannot be left over the reading.
  - F7: with the keyboard up at 320x568 200% and 390x844 300%, the field and Send sit inside the visible screen, on a first open from the Chats list too. Before, Send sat under the keyboard.
  - At 200% and 300% in landscape, and at 390x844 300%, the room opens on story text: the transcript's floor or the whole room.
  - Tests, each failing on the source before it and passing after: `tests/client/features/app-shell/surfaces/platform-short-room.suite.ct.tsx` and the `writing at` cells in `tests/client/features/app-shell/surfaces/platform-text-scale.suite.ct.tsx`.
  - Owner device check: a real iPhone keyboard on a first open, and a real finger scrolling the strip and Earlier messages back into view. CT shrinks the visual viewport by script and scrolls with a wheel.
