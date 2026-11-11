---
kind: tooling
status: open
updated: 2026-11-11
priority: P2
area: tooling
plan: checked-law
---

# A test resolves every cite in comments and law to something that exists

## What

The codebase review found most false prose was a dead name: a comment or law line citing a lint rule, a script, a test file, a decision or a symbol that no longer exists. tests/tooling/doc/comment-path-citations.repo.int.test.ts already fails a law doc, rule or AGENTS.md that cites a missing path. The same test shape can cover source comments and the other cite kinds: decision ids against docs/adr, pnpm script names against package.json, lint rule names against the composed ESLint, Biome and dependency-cruiser configs, test file paths, and TSDoc link targets against the program's symbols. tsdoc/syntax is already an error, which checks tag syntax and not that a link target exists.

## Why

A dead name misleads the next author with full confidence, and nothing fails when a rename or a deletion creates one. A resolver stops new ones on the day they are made.

## Done when

One test resolves each cite kind in comments under packages, tooling, tests and scripts and in the instruction and law files, by a cite grammar stated in the comment rule. Each kind has a planted control that goes red on a dead cite. Existing dead cites are corrected at their sites by codemod where the shape is mechanical, and the test reports zero.

## Evidence

Filled at landing: what ran and where its output is.
