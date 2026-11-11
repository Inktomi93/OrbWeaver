---
kind: tooling
status: open
updated: 2026-11-11
priority: P2
area: docs
plan: checked-law
---

# The writing text rules check rule files, AGENTS.md, skills and agents

## What

The prose checker in tooling/src/doc refuses dates, issue numbers, history phrases, counts and banned words, but only in the governed docs under docs. It skips .claude/rules, AGENTS.md, skills and agent files, which the writing rule also governs. AGENTS.md holds a dated path in prose today.

## Why

Instruction files reach every author on every task. They are the files where a stale date or count does the most harm, and they are the ones left unchecked.

## Done when

The prose checks run over AGENTS.md and the Markdown under .claude, with each existing hit fixed or given a stated carve-out for paths that carry a date by name. A planted date in a rule file fails the check. The writing rule names the checker.

## Evidence

Filled at landing: what ran and where its output is.
