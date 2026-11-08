---
kind: work
status: doing
updated: 2026-11-08
priority: P3
area: client
lane: wt/agent-a53049a5655c3c496
plan: cross-surface-consistency
---

# Retry controls share one label

## What

The label Try again is written by hand in many client files, and a chat constant carries the same words under a chat name. Give retry controls one shared label home and move the sites.

## Why

A label repeated by hand drifts, and the test label rule points unrelated tests at a chat constant.

## Done when

One constant names the retry label, no client file spells it by hand, and the label rule names that home.

## Evidence

`RETRY_NAME` in `packages/client/src/lib/retry-names.ts` is the one label, exported from `#lib`. The chat and import-preview constants are gone. Their readers moved with `move-import-names` and the hand-written literals with `literal-to-binding`; each dry run listed the files an independent `rg` of the exact string listed, and a rerun changed nothing. The share card, which wrote the label as JSX text, was edited by hand.

The label rule in `tooling/src/eslint/test-labels.ts` reads exported labels from production, so it now names `RETRY_NAME` as the one owner of this label. Sentences that end in "Try again" are copy, not the control label, and stay.
