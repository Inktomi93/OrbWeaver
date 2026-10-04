---
kind: bug
status: open
updated: 2026-10-04
priority: P2
area: plugin
---

# Draft Polish's prompt pass skips code spans

## What

polish() rewrites inside backticks ("keep--out..." saved as "keep--out…"), while the display seam already splits code spans out (CODE_SPAN_RE in showcase-plugins/bundles/draft-polish). Final pass leg 2 (plugins); review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-2-plugins.md.

## Why

Plugin final pass finding.

## Done when

The prompt pass uses the same code-span split, with a test.

## Evidence

Filled at landing: what ran and where its output is.
