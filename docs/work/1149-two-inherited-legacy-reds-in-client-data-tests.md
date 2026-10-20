---
kind: bug
status: open
updated: 2026-10-20
priority: P3
plan: test-foundation
---

# Two inherited legacy reds in client data tests

## What

tests/legacy/client/data/invalidation-initial-read.suite.test.ts fails at line 239 (expected 2 to be 1) on unmodified source, and tsconfig.tests-legacy.json fails at tests/legacy/client/data/bus/post-event-source.int.test.ts line 62 (missing liveBuses). Seen by the 1144 lane, which proved both on the base.

## Why

Legacy suites stay CI regression evidence under D320; a standing red hides the next real one.

## Done when

Each is fixed mechanically under D320 (a signature or fixture match) or handed to the 1093 rebuild ruling with its reason; both pass on main.

## Evidence

Filled at landing: what ran and where its output is.
