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

Reproduced on a clean worktree with vitest 5.0.5. The cache is `fsModuleCache`, on by default, stored at `node_modules/.vitest-cache` in the workspace root. Each worktree has its own `node_modules`, so the cache is not shared across worktrees.

Cause: `FileSystemModuleCache.generateCachePath` hashes the file id, its content and an environment hash (config, plugin names, config file contents). The lockfile hash only clears the whole cache when `pnpm-lock.yaml` changes. A workspace `exports` edit changes none of these.

Planted case: scratch export `@orb/kit/cb-cache-probe` pointing at `cb-cache-a.ts` (`WHICH = "A"`), scratch test asserting `"A"`. Run 1 passes and fills the cache. The export is retargeted to `cb-cache-b.ts` (`WHICH = "B"`).

- Before the fix, rerun of the unchanged test: passed (resolved the old target). After `vitest --clearCache`: failed with `expected 'B' to be 'A'`.
- After the fix (`vitest.config.ts` plugin using `configureVitest` and `defineCacheKeyGenerator` to hash every workspace `package.json`), same flip with no cache clearing: failed with `Received: "B"`.

The scratch files are deleted. `pnpm lint:eslint vitest.config.ts` and `pnpm typecheck tsconfig.json` exit 0.
