---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: client
plan: cross-surface-consistency
---

# A name-conflict alert in the create dialog is smaller than the text it bounds

## What

The design audit rule caveat-outweighed fails in the desktop-1440-all-panes-evidence walk on the Characters create dialog when its name is already taken. The alert sentence in the dialog form renders smaller than the field helper line it bounds. Checkpoints: native-name-conflict and characters-native-name-conflict-cancel-exit-control, at the dialog's form paragraph (`[data-slot=dialog-popup] > div.flex > form > ... > p.font-sans[data-slot=text]`). The same checkpoints carry a line-length finding on the same paragraph and on `[data-slot=character-overview] > p`, which the line-length item covers.

## Why

A caveat that bounds a statement but reads smaller than it is easy to miss; the audit flags it as a break in the type ramp for one authored pair.

## Done when

The alert and the sibling it bounds share a type tier, or the alert reads at least as large, shown by a component test on the production create dialog with a taken name that is red today; or the pair is answered with a cited reason. A false positive goes to the audit engine with a fixture.

## Evidence

Filled at landing: what ran and where its output is.
