---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: client
---

# Test or remove the held query's invalidate call in the chat wave

## What

Deleting query.invalidate() in the chat wave hold in packages/client/src/data/invalidation.ts turns no test red, and its comment cites an unmount revert that cannot happen with the tRPC queryFn.

## Why

An untested line in the cache seam can rot unnoticed or hide a real path.

## Done when

A DOM test covers the real case, an optimistic cancelQueries revert after the flush, and fails without the line; or the line is removed with its comment.

## Evidence

Filled at landing: what ran and where its output is.
