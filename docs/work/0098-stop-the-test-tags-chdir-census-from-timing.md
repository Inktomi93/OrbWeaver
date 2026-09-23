---
kind: bug
status: open
updated: 2026-09-23
priority: P3
area: tooling
---

# Stop the test-tags chdir census from timing out

## What

The chdir census in test-tags.int.test.ts times out, reproduced in a quiet rerun by the cache-check lane.

## Why

A timeout that reproduces on a quiet box is a real slowness or hang, not load.

## Done when

The census finishes within its budget on a quiet box, with the cause named in the fix commit.

## Evidence

Filled at landing: what ran and where its output is.
