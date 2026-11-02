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
