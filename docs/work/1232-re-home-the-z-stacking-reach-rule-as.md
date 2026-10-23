---
kind: tooling
status: open
updated: 2026-10-23
priority: P3
area: ui
---

# Re-home the z stacking reach rule as an enforced check

## What

The scope-to-token map that said which `z.*` token may be spelled where (`in-context`, `app-frame`, `portal-float`) had no consumer and is gone. The rule survives only as prose in `packages/client/src/features/app-shell/surfaces/shell.css`.

## Why

A rule nothing checks is advice; the `no-raw-z-index` rule proves vocabulary, not reach.

## Done when

A stylelint or ESLint rule refuses a `portal-float` token at a site that is not a portal-mounted or document-root float, with a fixture for each scope, or the owner rules the reach rule out and the prose goes.

## Evidence

Filled at landing: what ran and where its output is.
