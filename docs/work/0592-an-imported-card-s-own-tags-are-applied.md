---
kind: bug
status: open
updated: 2026-10-04
priority: P2
area: client
---

# An imported card's own tags are applied

## What

Import attaches card tags as pending suggestions (server entry/import/build-import-context.ts), so they show as SUGGESTED and Tags reads Empty. Owner ruling: the card author chose them, so apply them. Final visual pass; review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-1-rails-home.md.

## Why

Launch visual pass finding.

## Done when

Importing a card with tags shows them applied on the character, with a test.

## Evidence

Filled at landing: what ran and where its output is.
