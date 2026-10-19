---
kind: work
status: open
updated: 2026-10-19
priority: P3
---

# Split the code-facts and compiler engine files over their line cap

## What

max-lines still fires on tooling/src/floor/code-facts/\*, floor/compiler/{semantic-inventory-extract,invocation-evidence-extract,ts-workspace}, verify/lib/project-context.ts and verify/ops/policy-conformance.ts. These files change many times a week under the shared-reader lanes (953 to 957, 1098), so a split now collides with every sibling.

## Why

A file over its cap hides seams and makes every review larger; splitting it during active lane work causes conflicts.

## Done when

Each file sits under its cap along real seams, with its tests and registration lists updated, scheduled when the shared-reader lanes are quiet.

## Evidence

Filled at landing: what ran and where its output is.
