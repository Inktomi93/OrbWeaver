---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: assets
plan: unwired-code
---

# Add the admin rebuild asset index action

## What

AssetsService.rebuildFromTree has no caller. Wire an admin action that rebuilds the asset index from the files on disk.

## Why

Owner ruling: wanted maintenance action.

## Done when

The admin surface runs the production verb with progress and result feedback; host-only authorization holds; tests cover the verb through the router.

## Evidence

Filled at landing: what ran and where its output is.
