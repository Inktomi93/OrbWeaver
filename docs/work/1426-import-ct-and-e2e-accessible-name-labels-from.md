---
kind: work
status: open
updated: 2026-10-30
priority: P2
area: testing
plan: test-foundation
---

# Import CT and e2e accessible-name labels from production

## What

CT and e2e specs hand-type accessible names in getByRole, getByLabel and getByText that production does not export, across many files; the surface walkthrough drivers alone hold several hundred. Spine-Testing §9 requires labels to come from their production home. Hoist each feature's user-facing labels into a zero-import per-feature copy module (the existing \*-copy.ts pattern), have production render from it, and rewrite the spec sites to import it with a repo codemod (tooling/src/codemods/; load the codemod skill). orb/no-hand-copied-label already refuses a literal that a production module exports; once the labels are exported it covers these sites.

## Why

A hand-typed label is a second copy of production: a copy change breaks tests that never imported the source, and the walkthrough cannot follow a renamed control.

## Done when

Every accessible name a CT or e2e spec targets is imported from its production copy module or derived from a production registry; orb/no-hand-copied-label reports zero findings over tests/; the codemod ships with fixtures; affected suites pass.

## Evidence

Filled at landing: what ran and where its output is.
