---
kind: plan
status: active
updated: 2026-11-11
rank: 3
---

# Every ruling names its checker, and every claim in prose resolves

## Goal

A cold author cannot break a ruling without a tool failing, and cannot be misled by a sentence that points at a checker, file or decision that is gone. Rulings are never removed or weakened for lack of a checker; each one moves toward a type, a lint rule, a dependency rule or a test.

## Shape

A census lists each ruling in AGENTS.md, the path rules and the law docs with the checker that fails on a violation, or none. Its output is under reports/law-census. Two small checks land first so new prose cannot rot: a test resolves every cite in comments and law, and a lint rule refuses a comment that claims enforcement without a pointer to its checker. The comment rule then gains a budget for file headers, approved by the owner. Checkers are built in order of evidence: a ruling that a review found broken comes before one that has only been read as uncovered. Status claims in law docs are corrected against the tree. Comments are pruned package by package against the new rule last, because the first three steps define what stays.

## Rejected

Deleting or shrinking a ruling because nothing checks it. A per-file baseline of accepted findings. A custom gate framework or verify tier, which D333 forbids; every checker here is a native lint rule, a type, a dependency rule or an ordinary test. A separate documentation build to validate links.

## Coupled sites

AGENTS.md; .claude/rules/comments.md; .claude/rules/writing.md; docs/law; eslint.config.ts; tooling/src/eslint; tests/tooling/doc/comment-path-citations.repo.int.test.ts; reports/law-census; reports/codebase-review.

## Test plan

Each checker lands with a planted control that goes red with the checker off and reports zero findings on the tree the day it turns on. The cite test has a positive control for each cite kind it resolves.
