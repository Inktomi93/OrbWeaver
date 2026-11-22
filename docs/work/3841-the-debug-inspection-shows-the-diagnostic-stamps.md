---
kind: work
status: open
updated: 2026-11-22
priority: P3
area: server
plan: unwired-code
---

# The debug inspection shows the diagnostic stamps

## What

Columns the schema calls diagnostic provenance have no reader: chatLocks.acquiredAt, pluginAssets.fetchedAt, embedGenerations.connectionRef, embedSpaceState.completedAt.

## Why

Owner ruling : a field picked by name into a debug route counts as read. A diagnostic stamp nothing can show cannot diagnose anything.

## Done when

Each column is selected by name into the matching /api/\_debug inspection (chat lock, plugin assets, embed generation and space state); embedGenerations.connectionRef is shown only, never did resolve; a native application test reads each field from the route.

## Evidence

Filled at landing: what ran and where its output is.
