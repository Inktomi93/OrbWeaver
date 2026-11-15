---
kind: tooling
status: open
updated: 2026-11-15
priority: P3
area: tooling
---

# Partial source paths in comments are neither cites nor moved by the move codemod

## What

Comments such as `domain/stats/write/ledger-spend.ts` in packages/db/src/schema/stats.ts and `write/apply-delta.ts` in a domain service header are neither rooted nor relative. The cite grammar does not resolve them, and the move codemod does not rewrite them. Spell each as a rooted cite, and decide whether a lint rule refuses a path-shaped comment token that is not a cite.

## Why

A move leaves such a comment pointing at a file that no longer exists, and no check notices.

## Done when

Every path-shaped token in a source comment is a cite the comment citation test resolves, with the lint or test that refuses a new partial path.

## Evidence

Filled at landing: what ran and where its output is.
