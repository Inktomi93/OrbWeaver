---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: ui
plan: cross-surface-consistency
---

# Polish the preset import dialog: file name and description order

## What

In preset-import-dialog.tsx the dropzone does not show the picked file's name, and the description leads with the orbweaver-export dedup rules before the SillyTavern case.

## Why

A newcomer cannot confirm which file she picked and reads rules she does not need before the one that applies.

## Done when

The dropzone shows the picked file name and the description leads with the SillyTavern case.

## Evidence

Filled at landing: what ran and where its output is.
