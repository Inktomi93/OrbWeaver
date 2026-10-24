---
kind: tooling
status: open
updated: 2026-10-24
priority: P3
area: tooling
---

# A cold snap stage's first navigation comes up degraded

## What

In the 0656 lane, each cold isolated snap stage boot, or re-sync into a cleared stage, failed its first navigation: data-app-ready came up degraded (reads still in flight at the client's readiness ceiling, tooling/src/snap/ops/drive.ts). A warm retry passed. Six of fourteen runs failed this way; the runs are under reports/runs/snap/agent-a46b39870d7116c01-\* in the main checkout (gitignored).

## Why

Spine-Testing keeps cold failures as failures; a stage that needs a warm retry makes every first capture unreliable and teaches lanes to rerun until green.

## Done when

Reproduced on a cold stage with the cause named: dev-server cold module transform, a client read that outlives the readiness ceiling, or stage seeding still running. The cause is fixed so a cold stage's first navigation settles, without raising the readiness ceiling or adding a retry; a cold-boot run passes first time.

## Evidence

Filled at landing: what ran and where its output is.
