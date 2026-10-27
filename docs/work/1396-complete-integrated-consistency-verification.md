---
kind: work
status: open
updated: 2026-10-27
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

Read `reports/surface-consistency-private/full-verification/status.md` and the safe logs under `reports/surface-consistency-private/resume/`. Match each result to its checked source and scope before reuse.

Integrated full ESLint, full TypeScript and dependency-cruiser runs passed before subsequent dependent batches. Full Biome and Stylelint passed their recorded populations. Application tests exposed a generated owner-CSS freshness failure; regeneration and coupled suites pass. The original full application command was not green.

The full tooling command failed. Scoped contract, stack-isolation and portability repairs pass. Governed-document failures remain separate and must not be concealed by exclusions or baselines. Full Chromium, eligible WebKit and default E2E execution remain pending.

The raw `/tmp/orb-full-tooling-tests.log` contains credential-bearing failure output and is owner-readable only. Do not copy, print or commit it. The isolation defect is repaired; preserving the log does not undo credential exposure.

Serialize heavy checks and freeze the checked checkout. Use `pnpm test:tools` for tooling; `pnpm test` excludes that population. Run E2E through its disposable native stack with live-model cases disabled. Do not stop an unidentified service to free ports.

Reuse the existing icon ramp CT for rendered stroke-width acceptance. Reconcile the capture and native-boundary batches before claiming combined proof. Windows and macOS workflow definitions are not executed platform evidence.
