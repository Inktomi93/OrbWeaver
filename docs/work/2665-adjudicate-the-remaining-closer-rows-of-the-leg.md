---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
plan: checked-law
---

# Adjudicate the remaining closer rows of the leg four law census

## What

The leg four law census under `reports/law-census` proposes a small closer on many rows of the Spine, Core-0 and Constitution tables, such as deriving the `testkit-doors-only` list from the exports map of `tests/support/package.json`, mounting the clock selectors on `packages/plugin-sdk`, a selector for `vi.spyOn` on a module namespace and a cap test for custom matchers. Verify each row on the tree, build the ones that hold, and record the ones that do not with the reason. The fake-timer selector row is already refused: the law permits fake timers where a real timer window is the subject.

## Why

The rows are cheap native checks for rulings that nothing holds today.

## Done when

Every closer row is built with a planted control and on at zero, or listed as refused with its reason in the lane report.

## Evidence

Filled at landing: what ran and where its output is.
