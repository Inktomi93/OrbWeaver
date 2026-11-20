---
kind: bug
status: open
updated: 2026-11-20
priority: P2
area: chat
plan: chat-html-and-presets
---

# Character trust review fixes: the doors land on their control and the notice reads clean

## What

Rendered review of the Character trust change (the ux-reviewer report on trust and preset limits under reports/ux-reviewer/). The notice's Trust settings door opens the Trust tab half hidden under the tab overflow button (openCharacterTrust in packages/client/src/features/character/lib/character-selection-store.ts). The Trust and admin doors drop keyboard focus outside their target. Lower findings: the notice says media is held beside a visible load button for that image; a blocked HTML image shows the browser broken-image icon, not the designed placeholder; the Trust tab reads as equal-weight paragraphs; the notice caption runs past the prose cap; door button text sits indented from the copy above; the admin intro copy is muddled; the Trust tab shows the old media state until reload.

## Why

A door that hides its target or loses focus breaks the one action the notice offers, and the polish findings make the trust copy hard to scan.

## Done when

Each door scrolls its target into view and moves focus to the control it names; the tab strip shows the Trust tab whole; each lower finding is fixed or ruled with a reason; a CT covers the door focus and the tab visibility; a rendered check at phone and desktop confirms.

## Evidence

Filled at landing: what ran and where its output is.
