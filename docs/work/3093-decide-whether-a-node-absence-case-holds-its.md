---
kind: decision
status: open
updated: 2026-11-15
priority: P2
area: tests
plan: test-enforcement
---

# Decide whether a Node absence case holds its positive control in the same case

## What

The non-vacuity paragraph of Spine-Testing section 3 admits a positive control in the same test or its sibling. `orb/ct-negative-only-case` already demands the same case for CT and e2e, through its `absence` option in `eslint.config.ts`. Node tests run it with `absence: false`, so a Node case that only asserts an absence passes lint. A sampled read of those Node cases found most hold a sibling control in another case of the same file, and the rest hold none.

## Why

A sibling control proves the guard fires only when both cases run against the same wiring; a split or skipped sibling leaves the absence passing vacuously. The rule cannot check a sibling, so the law and the rule disagree and the Node cases stay unchecked.

## Done when

The ruling is recorded. Default: Node tests move to the same-case bar. Spine-Testing section 3 drops the sibling clause, each Node absence case merges with its allowed-path sibling or adds a control, and `eslint.config.ts` runs `orb/ct-negative-only-case` with `absence: true` on every test block at zero sites, in one commit.

## Evidence

Filled at landing: what ran and where its output is.
