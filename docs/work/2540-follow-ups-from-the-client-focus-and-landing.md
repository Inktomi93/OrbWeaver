---
kind: work
status: open
updated: 2026-11-11
priority: P3
area: client
plan: cross-surface-consistency
---

# Follow-ups from the client focus and landing review: list remounts, copied labels and an unwritten state-law row

## What

The code review of the client focus and landing branch confirmed the work and left findings outside its done criteria. The tag list and the world-info list swap their container type when the row count crosses the virtualization threshold and remount every row, so a focused row drops to the page body when a row arrives or leaves; the regex list had the same defect and was fixed on the branch. Several production Back-to labels are spelled as literals outside the copy module, and a few tests copy production labels. The character editor now reads the mutation cache to learn that its subject was deleted, and the state law has no row saying when a mutation-cache read is legitimate. The bus-wiring setup is copied across the test stories that need it, and one sizing test is a duplicate. Replacing one modal with another was not checked in the phone drawer presentation. Source: the client leg-six report under reports/code-reviewer.

## Why

Each is the same class of defect the branch fixed, on a surface it did not reach, or a rule the branch relied on that the law does not yet state. Left unfiled they are found again by the next review.

## Done when

The tag and world-info lists keep a focused row across a threshold crossing, by the shared owner the regex fix used, each with a component test that goes red without it. The Back-to labels read from their feature copy modules and the tests import them. The state law gains a row for mutation-cache reads with the editor's read as its example. The bus-wiring setup has one home in the browser testkit and the duplicate sizing test is deleted. A component test replaces one modal with another at phone width and asserts where focus lands.

## Evidence

Filled at landing: what ran and where its output is.
