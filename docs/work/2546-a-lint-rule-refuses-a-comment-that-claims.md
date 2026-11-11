---
kind: tooling
status: open
updated: 2026-11-11
priority: P2
area: tooling
plan: checked-law
---

# A lint rule refuses a comment that claims enforcement without pointing at its checker

## What

Comments and headers across the tree say a test holds an invariant, a lint rule refuses a shape or a check pins a value, with no pointer to the test or rule. The codebase review found many such claims false: the checker was never written or has since been deleted. A native lint rule over comment text can require that a sentence claiming enforcement carries a cite the cite test resolves, in the same grammar.

## Why

An enforcement claim is the one kind of comment a cold author relies on to skip a check of their own. A false one removes a safeguard without anyone deciding to.

## Done when

The rule is mounted for package, tooling and test source with a planted test. A census of the sites it flags is taken first; each claim is given its cite, corrected, or removed where no checker exists and a work item for the missing checker is filed. The rule lands at zero with no suppression. A ruling stated as an instruction to the author is not a claim and is not flagged.

## Evidence

Filled at landing: what ran and where its output is.
