---
kind: bug
status: blocked
updated: 2026-10-21
priority: P2
area: server
blocked: owner
---

# Server factory tier references follow their tier homes

## What

orb/server-factory-tier-reference reports placement findings on main: StructuredLane, ImageRejectReason, ZipByteSource, ScheduleOp, CatalogRefreshSchedulerDeps, WorkloadScheduleSchedulerDeps and PluginGitSourceDeps cross tiers from their factory files. orb/brand-in-name-position reports a bare assetId in domain/assets/contract/import-owned.ts. The full list is in reports/review/981-type-home-slice.md.

## Why

Native lint over the server is red until each shape reaches its sanctioned home.

## Done when

Native lint over the server reports no server-factory-tier-reference or brand-in-name-position finding, and no allowance is added.

## Evidence

The 1101 lint lane found a live case: `PersonaSeedStamps` in packages/server/src/entry/index.ts line 21. The 1099 audit lists the live findings: StructuredLane, ImageRejectReason, ZipByteSource, ScheduleOp (twice; also a copy of @orb/kit/time's ScheduleOp), CatalogRefreshSchedulerDeps, WorkloadScheduleSchedulerDeps, PluginGitSourceDeps and PersonaSeedStamps. The bounded 1099 rule also reports ImageGuardCaps (packages/server/src/infra/network/image-guard.ts:23), reaching domain/assets/verbs/materialize-background.ts, domain/assets/verbs/store-inline-reply-image.ts and entry/index.ts through isAllowedImageBuffer's caps parameter. The three ScheduleOp copies sit in transport/jobs/catalog-refresh-scheduler.ts, workload-schedule-scheduler.ts and oidc-gc-scheduler.ts; merge them onto @orb/kit/time's ScheduleOp.

Hosted run `39483788717` emits the factory-tier findings. The exact paths and locations are recorded in `reports/review/ci-39483788717/triage.md`.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
