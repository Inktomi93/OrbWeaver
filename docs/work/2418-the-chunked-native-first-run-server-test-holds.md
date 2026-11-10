---
kind: bug
status: open
updated: 2026-11-10
priority: P2
area: testing
plan: test-foundation
---

# The chunked native first-run server test holds its time budget in CI

## What

tests/support/node/server-native.int.test.ts, case 'chunked native first-run keeps the real body limit, CSRF and password/session', timed out at its 5 second budget in the hosted CI node job on main at 9b89d43a46, while 4815 other node tests passed.

## Why

A test that times out on the CI runner turns main red for a reason that is not a product defect, and CI is the release verdict.

## Done when

The case removes its repeated setup or measures what it waits on, holds its budget on the hosted runner across several runs, and the CI node job passes.

## Evidence

Filled at landing: what ran and where its output is.
