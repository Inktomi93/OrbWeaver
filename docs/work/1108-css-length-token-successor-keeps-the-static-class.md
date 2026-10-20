---
kind: tooling
status: open
updated: 2026-10-20
priority: P3
plan: test-foundation
---

# CSS length token successor keeps the static class carrier case

## What

In the 1041 stylelint shard, the css-length-tokens successor drops the class case: the old policy ran its length pattern over every candidate the Tailwind oxide scanner pulled from a static class carrier (tooling/src/verify/lib/css-length-policy.ts at bf24d71984).

## Why

Item 1041 moves the gate only when the successor keeps every claim the old gate made or records a loss with a census proving no live site depends on it; the shard was refuted on this point after three attempts, and the old gate stays in force until it passes.

## Done when

The successor covers the named case with a planted defect red first, or the loss is recorded with a census showing no live site, waiver or grant hits it; an independent verifier confirms; the old gate module is deleted.

## Evidence

Filled at landing: what ran and where its output is.
