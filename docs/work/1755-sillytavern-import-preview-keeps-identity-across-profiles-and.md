---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: server
plan: unwired-code
---

# SillyTavern import preview keeps identity across profiles and same-named orb books

## What

Keep import preview identity separate per SillyTavern profile and per same-named Orbweaver book.

## Why

A preview entry for a world book takes its identity from the book name: `domain/import/substrate/preview.ts` builds the worlds list with `item(book.name, book.name)`, and `mergeImportPreviews` in `packages/contracts/src/import/preview.ts` unions entries by `source`. Two books with one name collapse into one entry and one count. One preview covers one profile directory, so the per-profile merge is not shown by reading and needs the planted test to prove it.

## Done when

A test previews a folder that holds two world books with one name, and the preview lists two entries with separate counts. A second case previews two profiles that each hold a same-named book and shows the result.

## Evidence

Filled at landing: what ran and where its output is.
