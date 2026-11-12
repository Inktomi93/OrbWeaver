---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
plan: checked-law
---

# The cite test resolves a law section number to a heading that exists

## What

`tests/tooling/doc/comment-path-citations.repo.int.test.ts` resolves a cited doc to a tracked file and does not check the section number beside it. Extend the cite grammar in `tooling/src/eslint/cites.ts` and `.claude/rules/comments.md` so a doc name followed by a section sign and number resolves to a heading in that doc.

## Why

A renumbered law doc leaves every citer pointing at the wrong ruling with the test still green.

## Done when

A planted cite of a section that does not exist fails the cite test, and the tree passes at zero.

## Evidence

Filled at landing: what ran and where its output is.
