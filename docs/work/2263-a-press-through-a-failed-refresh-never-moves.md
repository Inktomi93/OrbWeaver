---
kind: bug
status: doing
updated: 2026-11-09
priority: P2
area: client
lane: wt/agent-a29390b41dbb30b06
plan: cross-surface-consistency
---

# A press through a failed refresh never moves the reader in any regime

## What

When the failure plate pins and its chrome height changes only because of the pin (copy wrapping beside Try again, then unwrapping when Dismiss replaces it), the reading-row hold in message-list.tsx starts and lands the reader's row below the plate, moving it by the plate height. A copy shortening fixed the phone cell, but larger text or a narrower column wraps it again. Make the hold skip a chrome change caused by the pin itself, carrying the cover the reading row was read under in ReadingRow, and amend the pinned-failure ruling in pinned-failure.ct.tsx to match.

## Why

A reader paging back through a failed refresh at enlarged text sees the transcript jump by the plate height.

## Done when

The failed-refresh pagination case holds the reader's row at 390 and 1280 at 100%, 200% and 300% text with the refresh copy wrapping, the pinned-failure arrival cases still pass, and the cells are red on the current tree.

## Evidence

Filled at landing: what ran and where its output is.
