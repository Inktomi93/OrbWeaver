---
kind: tooling
status: open
updated: 2026-11-15
priority: P3
area: tooling
plan: typed-enforcers
---

# The optional-signal refusal sees a signal behind a named type

## What

OPTIONAL_SIGNAL_SYNTAX in eslint.config.ts refuses inline optional signal slots, nullable unions, defaults, aliases, Partial bags and optional inline bags, but not an optional parameter whose type is a named interface or alias holding a signal member, and not an optional contracts bag declared apart from the op that takes it.

## Why

An op can still take an optional cancel through a named bag, which is the defect the rule exists to refuse.

## Done when

A typed check (or a selector over the resolved type) refuses an optional parameter whose type holds a signal member, with refused and accepted rows in tests/tooling/eslint-optional-signal.test.ts.

## Evidence

Filled at landing: what ran and where its output is.
