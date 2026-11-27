---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: import
lane: wt/agent-ab48c9f67c391d41f
plan: unwired-code
---

# The ST profile import and the folder-import preflight name what they skip or rename

## What

The profile collector renames a colliding card handle and re-homes fuzzy-matched chat folders, the card import counts carried lorebook references that did not resolve (attachedBooksSkipped and LinkCarriedBooksResult.skipped), the chat, persona and tag-library import totals are counted, and the client preflight knows each skipped file's path; the old fields scan dropped those fields, so none is shown.

## Why

Owner rule: data the app collects and never shows is a product item; the import domain records every loss, never silently.

## Done when

Each fact appears on the profile import report or the preflight notes with a rendered check, or the item rules one out with its reason.

## Evidence

Filled at landing: what ran and where its output is.
