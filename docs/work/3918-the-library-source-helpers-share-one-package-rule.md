---
kind: tooling
status: doing
updated: 2026-11-24
priority: P3
area: tooling
lane: wt/agent-a153864a73f49fb3e
plan: unwired-code
---

# The library-source helpers share one package rule and one test planter

## What

Review of 3915 (`reports/code-reviewer/2026-11-22-four-lanes.md`, B1) found three small splits: tooling/src/eslint/library-source.ts finds a file package by walking manifests on disk while the 7.1 side reads packageJsonDirectory; tests/tooling/\_library-link.ts repeats the planting in tests/tooling/brand-flow/library-origin.int.test.ts; port-census.ts LinkContext carries isLibrary and sources.isLibrary with different meanings.

## Why

One home per concept; two package rules can disagree on the same file.

## Done when

Both compiler sides name a package by the same rule, one planter serves both tests, and LinkContext has one library predicate.

## Evidence

Filled at landing: what ran and where its output is.
