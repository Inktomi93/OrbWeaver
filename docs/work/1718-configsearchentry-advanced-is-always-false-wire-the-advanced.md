---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: client
plan: unwired-code
---

# ConfigSearchEntry.advanced is always false: wire the advanced flag or delete it

## What

Delete the `@advanced` search token, its hint, the `advanced` filter axis, the `GroupSearchRows` branch and `ConfigSearchEntry.advanced`. The palette lists every entry.

## Why

Owner ruling: advanced settings appear through a visible control (a show-more toggle, dropdown or show-advanced option), never through a typed `@advanced` search token. `ConfigSearchEntry.advanced` was false at every build site, so the token always returned nothing.

The visible control already exists: the Appearance group's `advancedFold` ("Customize this look", `packages/client/src/features/config/lib/appearance-group.tsx`) is a collapsed disclosure that holds the `advanced: true` sections (`packages/client/src/features/config/surfaces/config-content-surface.tsx`). Search indexes those sections like any other, and a search hit or list click on a folded section opens the fold before it scrolls (`config-content-surface.tsx`, the `landingNonce` branch). A group-level hit names no section and leaves the fold closed.

## Done when

No `@advanced` token, `advanced` filter or `ConfigSearchEntry.advanced` in `packages/client/src`. Search still finds every setting, folded ones included.

## Evidence

Typecheck for `packages/client/tsconfig.json`, `tsconfig.tests-dom.json` and `tsconfig.node.json`, the config-search CT (3 tests), eslint on the touched files, `pnpm depcruise` and `pnpm knip` all pass. Literal `rg` for `@advanced`, `entry.advanced` and `parsed.advanced` across `packages` and `tests` returns no matches.
