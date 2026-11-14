---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# A dialog's failure line reads at the body size in every dialog

## What

A dialog's failure line is drawn as a label-voice `Text` with the alert role, so it reads smaller than the dialog description above it. The Characters create dialog draws it at the body step, as the confirm dialog does. The schedule, run-workload, add-chat-document, add-chat-book, add-chat-script, invite, gallery picker and user-admin dialogs still use the label voice. Give the failure line one shared owner in `packages/client/src/components` and move every dialog to it.

## Why

The most important sentence in a failed dialog is the smallest text in it, and each dialog spells the line by hand.

## Done when

A component test on each production dialog in its failed state reads the failure line's font size as the body step, and a census entry or a lint rule refuses a hand-spelled alert line in a dialog.

## Evidence

Filled at landing: what ran and where its output is.
