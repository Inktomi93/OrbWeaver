---
kind: bug
status: open
updated: 2026-11-20
priority: P2
area: preset
plan: cross-surface-consistency
---

# Preset Output review fixes: the context tooltip counts the real window and the limit notes read as one

## What

Rendered review of the preset limit sources change (the ux-reviewer report on trust and preset limits under reports/ux-reviewer/). The Max context tooltip computes against the guessed window instead of the preset's own window, which the turn uses (packages/client/src/features/preset/components/params-limits.tsx), so it says nothing fits when the turn has room. A slider past a guess announces the guess, not the saved value. The Set real context window door opens the connection editor at the top with the setting below the fold and focus elsewhere (packages/client/src/features/credentials/lib/connection-editor-request-store.ts). The past-guess warning is styled like a neutral note. The row clamp note and the full note state the same clamp in two styles (packages/client/src/features/preset/lib/effective-knobs.ts). On a phone at enlarged text the editor header and tabs leave little room for the Output rows.

## Why

A wrong count in the tooltip tells the user their preset cannot work, and duplicated or quiet warnings hide the one fact that matters.

## Done when

The tooltip counts against the window the turn uses; the slider announces the saved value; the door scrolls to and focuses the window setting; the warning uses the warning tone; one note states the clamp; the phone header leaves the Output rows usable at enlarged text; CTs cover the tooltip count, the announced value and the door focus.

## Evidence

Filled at landing: what ran and where its output is.
