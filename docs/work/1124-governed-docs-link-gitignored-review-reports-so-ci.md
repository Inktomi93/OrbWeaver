---
kind: bug
status: doing
updated: 2026-10-19
priority: P1
lane: wt/agent-acb14f15173490df8
---

# Governed docs link gitignored review reports, so CI fails the doc checks

## What

docs/plans/test-foundation/design.md links reports/review/seven-day-bottleneck-claude-analysis.md, reports/review/1027-remaining-delivery-boundary.md and reports/review/typed-gate-necessity-census.md. Those files are gitignored, so they exist only in the main checkout. Every clean checkout (each lane worktree and CI) fails pnpm check:agents, tests/tooling/doc/ops/check.int.test.ts and tests/tooling/doc/doc-links.suite.repo.int.test.ts on them. Other governed docs may cite gitignored reports the same way.

## Why

CI is the verdict (D317), and a doc check that passes only on the one checkout holding untracked files hides a red that every clean checkout sees.

## Done when

A census of governed docs lists every link or backticked path into a gitignored location. Each is repointed to a tracked home, or rewritten as plain text that the checker does not resolve, under a rule written in .claude/rules/docs.md. check:agents and tests/tooling/doc pass in a fresh worktree.

## Evidence

Filled at landing: what ran and where its output is.
