---
kind: tooling
status: open
updated: 2026-11-15
priority: P3
area: tooling
plan: snap-secret-hygiene
---

# Give snap one page-free door that turns a Playwright error into its scrubbed line

## What

The NAV ERROR line in `tooling/src/snap/ops/capture.ts`, the assert, aria and eval error lines in `tooling/src/snap/ops/arms/` and the drive failure messages each build their own text from a Playwright error and pick a scrub by hand. Those sites run only inside `capture()` or an branch's `lifecycle.run`, which need a real Playwright page, so no in-process test reaches them.

## Why

A call-log quoter on the whole-value scrub keeps the prefix of a noted value Playwright cut, and nothing but review caught the sites that regressed that way.

## Done when

One production function in `tooling/src/snap/lib/private-values.ts` turns a Playwright error and its label into the scrubbed line, every such site calls it, an in-process test proves the function with a cut call log, and a native lint selector refuses a whole-value scrub over `errorMessage` in `tooling/src/snap`.

## Evidence

Filled at landing: what ran and where its output is.
