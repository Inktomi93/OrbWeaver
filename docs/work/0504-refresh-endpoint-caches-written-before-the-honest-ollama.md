---
kind: work
status: open
updated: 2026-10-03
priority: P3
area: connection
---

# Refresh endpoint caches written before the honest Ollama window

## What

Endpoint snapshots persisted before 0491 keep an overstated Ollama window for up to a week, until the connection is saved or tested.

## Why

Upgraders see the old 8192 guess.

## Done when

An upgrade invalidates pre-0491 endpoint snapshots, or the stale window is ignored.

## Evidence

Filled at landing: what ran and where its output is.
