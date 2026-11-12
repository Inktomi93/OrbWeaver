---
kind: tooling
status: doing
updated: 2026-11-12
priority: P3
lane: wt/agent-a672cae2c753c5fe3
plan: checked-law
---

# The cite grammar reads the remaining section spellings and one heading per cite

## What

After its extension the cite grammar in `tooling/src/eslint/cites.ts` still misses a doubled section sign before a range, a section named before its doc with the word of between them, and a section inside spaced parentheses. A cite of the dispatch section of the types spine resolves two ways: to an aliased heading and to a numbered item under another heading. Examples are in the tooling review under reports/code-reviewer.

## Why

A spelling the grammar cannot read is a cite nothing checks, and a cite that resolves two ways can pass while pointing at the wrong ruling.

## Done when

Each listed spelling resolves with a planted control for a missing section, a cite that matches more than one heading is refused, and the tree passes at zero.

## Evidence

Filled at landing: what ran and where its output is.
