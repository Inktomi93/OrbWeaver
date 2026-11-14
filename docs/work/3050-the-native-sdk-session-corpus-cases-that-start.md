---
kind: bug
status: open
updated: 2026-11-14
priority: P1
area: tests
plan: test-foundation
---

# The native SDK session corpus cases that start six and ten real children carry the slow tag

## What

tests/support/node/corpus-sdk-sessions.int.test.ts runs one real Node stand-in child per SDK turn: the replay case starts six and the canon lineage case ten, in sequence, and each child's cold start measures about four tenths of a second on two pinned cores against two hundredths for a bare node start. Both cases now carry the slow tag, as the sibling sdk-wire suite already does for its child cases. Production also awaits one child per SDK turn, so no event loop is held.

## Why

The lineage case timed out at the five second default on the hosted two-core runner and on a loaded local box; its runtime is the child count times a cold start, not a product defect.

## Done when

Both cases carry the slow tag and the file passes three times in a row pinned to two cores with two workers.

## Evidence

Filled at landing: what ran and where its output is.
