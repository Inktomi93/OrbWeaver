---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: stats
---

# The stats scan page no longer holds the event loop on a heavy library

## What

The rebuild and retirement scans read canon in pages of `CHUNK` rows (`packages/server/src/domain/stats/persistence/rebuild-from-canon.ts`). On a heavy library one page held the event loop for about half a second in a measured run. Size the page, or yield between pages, so no page holds the loop that long.

## Why

While a page is folded, every request on the server waits.

## Done when

A measured rebuild on a heavy library shows no single loop hold near half a second, and live still equals a rebuild.

## Evidence

Filled at landing: what ran and where its output is.
