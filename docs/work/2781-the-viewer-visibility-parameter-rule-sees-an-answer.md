---
kind: tooling
status: open
updated: 2026-11-13
priority: P3
area: tooling
plan: authorization-and-visibility
---

# The viewer-visibility parameter rule sees an answer through a wrapper

## What

The lint rule `orb/viewer-visibility-parameter-checked` in `tooling/src/eslint/viewer-visibility.ts` does not flag an answer forwarded to an overload whose implementation takes `unknown`, passed through a generic identity function, held in an array or a promise, or taken as a constructor parameter property. No server code has these shapes today and the runtime check stands beside the rule. Options nested deeper than one level, a check against the wrong chat id and a reassigned checked parameter stay out of the rule.

## Why

A new function could carry an unchecked visibility answer through one of these shapes and the rule would stay quiet.

## Done when

The rule flags the overload, identity, container and parameter-property shapes, each with a planted control in `tests/tooling/eslint-viewer-visibility-parameter.test.ts`.

## Evidence

Filled at landing: what ran and where its output is.
