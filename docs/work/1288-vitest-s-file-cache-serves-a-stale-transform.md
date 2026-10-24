---
kind: tooling
status: open
updated: 2026-10-24
priority: P3
area: tooling
---

# Vitest's file cache serves a stale transform after a package exports-map change

## What

Vitest caches a test file's transform under node_modules/.vitest-cache keyed on that file's content, not on the package.json exports maps it resolves through. Item 1286's lane flipped `@orb/db/wiring-owner` to a new target and an unchanged test file kept resolving the old target from cache, giving a false red until the cache entry was deleted. Not yet reproduced on main.

## Why

A cache that ignores resolution inputs makes an exports-map change look broken, or worse, look green against the old graph.

## Done when

Reproduced or refuted on a clean tree; if real, the cache key includes the resolved package exports (a vitest config option or a cache-busting input in the test config), proven by flipping an exports map in a scratch worktree and rerunning an unchanged test.

## Evidence

Filled at landing: what ran and where its output is.
