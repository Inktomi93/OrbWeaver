---
kind: work
status: open
updated: 2026-10-30
priority: P2
area: testing
plan: cross-surface-consistency
---

# Complete integrated consistency verification

## What

Finish the requested integrated application and tooling verification after the capture, import-boundary and platform repairs. Preserve existing scoped evidence and classify remaining documentation failures separately.

## Why

Source review and targeted repairs do not establish full application, browser or end-to-end success.

## Done when

Read completed application and tooling tests, Chromium component tests, eligible WebKit cases, default E2E projects, TypeScript, Biome, ESLint, Stylelint and dependency-cruiser results. Resolve required failures or state precise remaining blockers. Do not call skipped platform or live-model cases passed.

## Evidence

Read `reports/surface-consistency-private/full-verification/status.md` for completed results, source scope, corrected failures and commands still required.

Full application, tooling and Chromium runs have recorded failures and scoped repairs. Eligible full WebKit and default E2E acceptance remain open.

Include the geometry helper's complete consumer population and the repaired Admin census cases. Match each reusable result to unchanged source and execution scope.

Governed-document failures remain separately classified. Do not conceal them with exclusions or baselines.

The raw `/tmp/orb-full-tooling-tests.log` contains credential-bearing output. Do not copy, print or commit it; use the safe verification records.

Serialize heavy checks and freeze the checked checkout. Use `pnpm test:tools` for tooling; `pnpm test` excludes that population.

Run E2E through disposable native stacks with live-model cases disabled. Do not stop an unidentified service to free ports.

Workflow definitions are not native Windows or macOS execution evidence. Report platform and live-model exclusions explicitly.

### Run on main at 5cd18734b8 (claude-b)

Logs under reports/surface-consistency-private/full-verification (v1396-\*.log).

| Check | Result |
| - | - |
| pnpm test:tools | 19 failed in 14 files under load. Three real reds fixed in e6988b1fac (merged 783d67c55a): the snap accepted-flag ledger row, the dependabot patched-dep ignores, the stage death sweep on a one-row band table. ui-facts class-owners fixed in 3603682a70. The other failures pass alone at load under 20; the slow files are 2354 and 2355. |
| pnpm test:ct:webkit | 14 failed, 1429 passed; owned by 2353 |
| pnpm test:ct:tools | 64 passed |
| pnpm e2e (default projects, live off) | 137 passed, 1 failed (polyfill-floor webkit); owned by 2353 |
| Node, Chromium CT, ESLint, typecheck, Biome, Stylelint, depcruise | read from CI on the next push |
