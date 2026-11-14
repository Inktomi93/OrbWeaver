---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# Dialogs prove their failed state through the shell's own frame

## What

Dialogs draw a failed submit through one owner, `DialogFailure`, and a lint rule refuses a hand-spelled line. A failed-state component test exists for a few dialogs only; the dialog lane's report lists the rest with the mount door each would use. The helper `tests/support/browser/ct-modals.tsx` draws a commit modal inside a frame the product never draws, and several feature suites mount through it instead of through the shell and the modal's opener.

## Why

A dialog whose failure is never mounted can lose its failure line or its typed text without a red test, and a test under a frame the product never draws proves a layout nobody sees.

## Done when

Each listed dialog has a case that fails its submit on the production shell and shows the failure line with the typed text kept, and the suites that used the helper mount through the shell and the opener.

## Evidence

Filled at landing: what ran and where its output is.
