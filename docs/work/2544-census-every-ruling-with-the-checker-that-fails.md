---
kind: work
status: open
updated: 2026-11-11
priority: P2
area: tooling
plan: checked-law
---

# Census every ruling with the checker that fails when it is broken

## What

No list says which rulings a tool checks. The owner has been reading law by hand and building a checker per ruling, with no view of what is left. A read-only census covers AGENTS.md, the path rules under .claude/rules and each doc under docs/law. For each ruling it records the checker that would fail on a violation, found by opening the checker and not by trusting the sentence, or none, with the cost of a violation. Sentences that claim a check exists and point at nothing are recorded as such. Output goes under reports/law-census, one report per law area.

## Why

A ruling with no checker holds only while an author reads and obeys it, and the reviews found rulings broken with nothing failing. The census turns an open-ended read into a ranked list.

## Done when

A report exists for AGENTS.md with the path rules and for each law doc, each row carrying its evidence path. One ranked list across all reports names the unchecked rulings whose violation costs most with the checker shape for each, and each of those has a work item in this plan.

## Evidence

Filled at landing: what ran and where its output is.
