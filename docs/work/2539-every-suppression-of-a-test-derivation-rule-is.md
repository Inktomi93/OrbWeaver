---
kind: work
status: open
updated: 2026-11-11
priority: P3
area: tests
plan: test-enforcement
---

# Every suppression of a test-derivation rule is re-judged

## What

The tree holds a small number of inline suppressions of the rules that make tests derive from production: orb/no-test-fabrication is disabled at about fifteen sites and orb/no-hand-copied-label at four, with a few of orb/ct-responder-reads-input. Unused suppressions already fail lint and each carries a reason, so these are live and argued. They were written before the rules gained their current indexes, and a reason that was true then may name a production export that exists now.

## Why

A suppression is a grant, not authority. These rules are the ones the review-fix work leaned on most, and a stale grant is where a copied value hides.

## Done when

Each suppression of those three rules is read against the tree: removed where the test can now derive the value, kept only where the reason on the line is still true, and the rule or its index is fixed where the suppression exists because the rule is wrong. The count before and after is recorded at landing.

## Evidence

Filled at landing: what ran and where its output is.
