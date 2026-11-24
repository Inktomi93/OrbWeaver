---
kind: tooling
status: open
updated: 2026-11-24
priority: P3
area: tooling
plan: unwired-code
---

# The apart-program memory count names the process it measures

## What

tooling/src/unwired/graph/build.ts records an apart program's memory from Node's own resident size, so the count labels Node's memory as the apart compiler's.

## Why

The profile now reports each compiler's own peak, and a mislabeled count points at the wrong process.

## Done when

The count is renamed for Node or dropped in favor of the profile's per-compiler peak.

## Evidence

Filled at landing: what ran and where its output is.
