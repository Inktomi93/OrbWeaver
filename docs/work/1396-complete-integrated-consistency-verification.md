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
