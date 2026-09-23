---
kind: tooling
status: open
updated: 2026-09-23
priority: P1
area: tooling
---

# Close the lifecycle gaps for items, plans, ADRs and law

## What

Landing a done item deletes its file and records the evidence in the landing commit. A finished plan is deleted, not archived; its lasting knowledge moves to ADRs or law first. Plans gain a parked status with a wake condition, and drift names a plan whose items are all done. ADRs gain a rejected status for decisions considered and turned down. A new doc new law verb mints a law doc. doc remove works on any governed doc and refuses while citers remain. docs/law/docs-and-work.md and .claude/rules/docs.md are updated, including when to write an ADR and when to write law.

## Why

Done items and archived plans pile up, which is the sprawl the docs system exists to end. Parked programs are faked with blocked items, a dead decision can only be marked superseded, and law docs are created and deleted by hand. Agents also cannot tell when a piece of knowledge belongs in an ADR or in law.

## Done when

A test covers each new verb and state, including refusals. Landing a done item removes its file. doc drift names a plan whose items are all done. docs-and-work.md has a section that says when to reach for an ADR and when for law, with one example of each.

## Evidence

Filled at landing: what ran and where its output is.
