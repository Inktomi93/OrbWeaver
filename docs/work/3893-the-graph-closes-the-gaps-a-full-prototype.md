---
kind: tooling
status: open
updated: 2026-11-22
priority: P2
area: tooling
plan: unwired-code
---

# The graph closes the gaps a full prototype read found

## What

The graph keeps fixed walk depths (parameter-keyed lookups, flow unwrapping), lacks the unused-effect bucket and the test-only split by testkit, tooling and direct test from reports/api-play/graph2.ts, has no per-world shape check for 3864 (merge-test3.ts, diag-all.ts) and no table test over the role fixture reports/api-play/proj/forms.ts; "k" in x and Object.keys(x) are unchecked.

## Why

Owner ruling: walks end on a seen-set, never a fixed depth. 3864 needs the merged program proved against the worlds.

## Done when

Seen-sets replace the depths with a planted case deeper than the old limit; the two buckets exist; graph-worlds-check lists every per-world shape difference and explains each merged-program error; forms.ts runs as a case-per-member table; in-tests are a key use and Object.keys hands the value on whole.

## Evidence

Filled at landing: what ran and where its output is.
