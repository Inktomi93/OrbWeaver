---
kind: work
status: open
updated: 2026-11-27
priority: P3
area: import
plan: unwired-code
---

# The ST profile import and the folder-import preflight name what they skip or rename

## What

The profile collector renames a colliding card handle and re-homes fuzzy-matched chat folders, the card import counts carried lorebook references that did not resolve, and the client preflight knows each skipped file's path; the old fields scan dropped those fields (CollectResult.collidedCards and fuzzyPairedDirs, ImportCharacterResult.attachedBooksSkipped, SkippedTreeFile.path), so none is shown.

## Why

Owner rule: data the app collects and never shows is a product item; the import domain records every loss, never silently.

## Done when

Each fact appears on the profile import report or the preflight notes with a rendered check, or the item rules one out with its reason.

## Evidence

Filled at landing: what ran and where its output is.
