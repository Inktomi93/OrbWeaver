---
kind: work
status: open
updated: 2026-11-11
priority: P3
area: client
plan: cross-surface-consistency
---

# Dialogs that commit use the form or flow composite

## What

Several dialogs build a commit footer by hand inside DismissDialog (add-chat-script-dialog.tsx, preset-fork-choice-dialog.tsx, add-connection-form-body.tsx, first-model-setup.tsx) and gallery-add-picker.tsx builds one inside PickerDialog. The form and flow composites gain what these need once: a second stage, a footer that can stand down, a variable submit, and a picker footer lead. Sites: the class 1 table in the survey rulings for item 1766 under reports/cb-survey-1766.

## Why

A hand-built footer skips the composite's Cancel and submit contract.

## Done when

No listed site builds a DialogFooter, and component tests cover each new composite option on a production dialog.

## Evidence

Filled at landing: what ran and where its output is.
