---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: client
plan: cross-surface-consistency
---

# The upload refusal line hides under the dialog footer at enlarged text, and the theme leftovers note reads as one undivided list

## What

Two findings on surfaces the review-fix branch changed. In the Databank add-document dialog at a short viewport with text at one and a half times, the dialog footer covers the last line of the too-large refusal; the line is under the footer, not off screen, so the component test that checks it is in the viewport passes (packages/client/src/features/databank/components/add-document-body.tsx). In the theme import leftovers note, the sentence about settings with no equivalent follows the list of settings the person sets themselves and reads as being about them, and the SillyTavern names are one flat list with no grouping (packages/client/src/features/config/components/theme-import-leftovers.tsx and lib/theme-import-copy.ts). Smaller notes on the same surfaces: a refusal by the dropzone itself does not mark the control invalid, the note says Chat width where the pane says Chat width with its unit, and the note says its set-it-yourself line twice. Source: the client rendered re-check report under reports/review.

## Why

An error a person cannot see is the defect the fix was for, at one more text size. A note that groups nothing leaves the person unsure which settings they need to touch.

## Done when

The dialog's scroll body keeps a refusal line clear of the footer at every supported text size, and the component test asserts the line is not covered, not only that it is in the viewport. The note shows each group under its own sentence, with the raw names grouped the same way inside the disclosure, names each setting exactly as the Appearance pane does, and says its instruction once. A dropzone refusal marks the control invalid.

## Evidence

Filled at landing: what ran and where its output is.
