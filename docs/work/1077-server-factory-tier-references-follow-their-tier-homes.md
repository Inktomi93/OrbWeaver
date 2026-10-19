---
kind: bug
status: open
updated: 2026-10-19
priority: P2
area: server
---

# Server factory tier references follow their tier homes

## What

orb/server-factory-tier-reference reports placement findings on main: StructuredLane, ImageRejectReason, ZipByteSource, ScheduleOp, CatalogRefreshSchedulerDeps, WorkloadScheduleSchedulerDeps and PluginGitSourceDeps cross tiers from their factory files. orb/brand-in-name-position reports a bare assetId in domain/assets/contract/import-owned.ts. The full list is in reports/review/981-type-home-slice.md.

## Why

Native lint over the server is red until each shape reaches its sanctioned home.

## Done when

Native lint over the server reports no server-factory-tier-reference or brand-in-name-position finding, and no allowance is added.

## Evidence

The 1101 lint lane found a live case: `PersonaSeedStamps` in packages/server/src/entry/index.ts line 21.
