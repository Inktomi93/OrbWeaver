---
kind: tooling
status: open
updated: 2026-10-24
priority: P2
area: tooling
plan: test-foundation
---

# A cold snap stage's first navigation comes up degraded

## What

In the 0656 lane, each cold isolated snap stage boot, or re-sync into a cleared stage, failed its first navigation: data-app-ready came up degraded (reads still in flight at the client's readiness ceiling, tooling/src/snap/ops/drive.ts). A warm retry passed. Six of fourteen runs failed this way; the runs are under reports/runs/snap/agent-a46b39870d7116c01-\* in the main checkout (gitignored).

The same failure appears on the e2e path: the first corpus case of a cold `scripts/corpus-fixture.ts e2e` run reported `data-app-ready="degraded"` with the router splash still up after 30 s, while the lazy `authed-app` chunk was still compiling under vite dev, at a load average near the core count. Artifacts: the cb-shelle2e run0 copy in the session scratchpad. The cause is likely shared: a readiness ceiling shorter than a cold dev transform under load.

## Why

Spine-Testing keeps cold failures as failures; a stage that needs a warm retry makes every first capture unreliable and teaches lanes to rerun until green.

## Done when

E2E: every mode serves a production build of the client, the way the OIDC project already does in `playwright.config.ts`, so no cold e2e run compiles modules on demand; a cold run on a loaded box passes its first corpus case with the readiness ceiling unchanged. Snap: the cause of a cold isolated stage's degraded first navigation is named (dev transform, a read past the ceiling, or stage seeding) and fixed without raising the ceiling or adding a retry; a cold-boot snap run passes first time.

## Evidence

Filled at landing: what ran and where its output is.
