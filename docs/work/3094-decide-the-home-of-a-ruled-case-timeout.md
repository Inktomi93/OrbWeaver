---
kind: decision
status: open
updated: 2026-11-15
priority: P2
area: tests
plan: test-enforcement
---

# Decide the home of a ruled case timeout and refuse every other case timeout

## What

Test cases set their own `timeout` option with constants, literals and positional budgets. Many are ESLint config-load budgets that `tests/tooling/_eslint-config.ts` makes stale by warming the config at import. The rest cover real browser, native plugin and git proofs. `.claude/rules/node-tests.md` tells a loop over a policy family to scale its timeout, which conflicts with refusing a case timeout. Collect the site list and budgets before ruling.

## Why

A case budget raised by hand hides a slow or hung proof and lets a regression in runtime land unseen. Without one home, each file picks its own number and the `slow` tag in `tooling/src/floor/testing/test-tags.ts` stops being the runtime axis Spine-Testing section 8 names.

## Done when

The ruling is recorded. Default: a codemod first deletes every config-load budget and each file passes under the default. A proof whose real runtime exceeds the `slow` budget then takes a row in one registry of ruled budgets in `tooling/src/floor/testing/test-tags.ts`, with its reason. A lint rule refuses a case timeout that is not a registry row, at zero sites, and `.claude/rules/node-tests.md` points its loop line at the registry, in one commit.

## Evidence

Filled at landing: what ran and where its output is.
