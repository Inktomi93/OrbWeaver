---
kind: work
status: open
updated: 2026-10-23
priority: P3
area: tests
---

# Server harness owns importReportsDir

## What

`packages/server/src/entry/compose/services.ts` hardcodes `importReportsDir: env.DATA_LAYOUT.reports`; the harness supplies `casDir`, `variantDir`, `importStagingDir` and `wireCaptureDir` but no reports directory, so integration runs write `data/reports/import-*.md` into the checkout.

## Why

A test must not write into the working tree; the directory is gitignored, which hides the leak.

## Done when

`ServicesDeps` takes `importReportsDir`, the harness supplies one under its root, and a full integration run leaves no `data/` directory in the checkout.

## Evidence

Filled at landing: what ran and where its output is.
