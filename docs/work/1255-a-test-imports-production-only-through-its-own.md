---
kind: work
status: open
updated: 2026-10-24
priority: P1
area: tests
---

# A test imports production only through its own mirror's front door

## What

Production enforces tier direction and forbids sideways domain imports (`.dependency-cruiser.ts`, the `domain-feature-front-door` and tier rules). The test tree mirrors the source tree but has no equivalent rule: a test under `tests/server/domain/<x>/` may import another domain's front door (eleven sites today: chat tests import `admin`, stats import `chat`, plugin import `settings`, settings import `persona`, `character` and `assets`, rpg and tool-use import `chat`) and may reach into `entry/` or `foundation/` (thirty-five files, mostly `authConfigFromEnv` from `entry/auth` and `getLog`, `logRing`, `recentTraces` from `foundation/observability`). The composed root already exposes every service and the harness owns auth config, so these are tests reaching past the product's own doors.

## Why

A test that imports another domain or a lower tier directly asserts on wiring the product does not expose, and a storage or tier refactor breaks it; the cake is only a cake if tests obey it too.

## Done when

A dependency-cruiser rule using a capture group: a module under `tests/server/<tier>/<name>/` may import production only from `packages/server/src/<tier>/<name>/index.ts` (its mirror's front door), `@orb/contracts`, `@orb/kit`, `@orb/db` types, and testkit doors; everything else reaches the test through the composed root or a harness seam; the eleven cross-domain and thirty-five cross-tier sites are swept onto `root.services.*`, `root.app.*`, `harness.authConfig` and a harness log seam (`harness.logs` or the existing capture) where one exists, or the missing seam is added to the harness; a planted probe pair proves the rule; the same shape applied to `tests/client`, `tests/inference`, `tests/kit`, `tests/contracts`, `tests/db` mirrors with the package door as the allowed import; README "What is enforced" and Spine-Testing §2 name the rule.

## Evidence

Filled at landing: what ran and where its output is.
