---
kind: work
status: open
updated: 2026-11-11
priority: P2
area: client
plan: cross-surface-consistency
---

# Follow-ups from the client focus and landing review: list remounts, copied labels and an unwritten state-law row

## What

The code review of the client focus and landing branch confirmed the work and left findings outside its done criteria. The regex, tag and world-info lists each swap their container type when the row count crosses the virtualization threshold, which remounts every row, so a focused row drops to the page body when a row arrives from elsewhere or the count crosses the line. Each list picks its own container and there is no shared owner. The client lane built the regex list as always virtualized and every regex test passed, but at a short window with enlarged text the shared VirtualList gets no height and its rows cannot be reached (the coarse landscape enlarged case in the platform collection composition suite went red). Ruling: the fix is in the shared VirtualList, which gains a mode for a window too short to bound it, so a list is one container at every size; a focus-follow patch on one list is refused as a site fix for a design-system fault. Also from the review: several production Back-to labels are spelled as literals outside the copy module and a few tests copy production labels; the character editor reads the mutation cache to learn its subject was deleted and the state law has no row for a mutation-cache read; the bus-wiring setup is copied across the test stories that need it and one sizing test is a duplicate; replacing one modal with another was not checked in the phone drawer presentation. Source: the client leg-six code review under reports/code-reviewer and the leg-seven section of the client lane report.

## Why

Each is the same class of defect the branch fixed, on a surface it did not reach, or a rule the branch relied on that the law does not yet state. Left unfiled they are found again by the next review.

## Done when

The shared VirtualList renders its rows reachable in a window too short to bound it, by a design recorded in the ui package law, and the regex, tag and world-info lists each use one container at every size with their threshold swap deleted. A component test per list focuses a row, has a row arrive from elsewhere across the threshold, and asserts the row keeps focus, red before the change; the coarse landscape enlarged case stays green. The Back-to labels read from their feature copy modules and the tests import them. The state law gains a row for mutation-cache reads with the editor's read as its example. The bus-wiring setup has one home in the browser testkit and the duplicate sizing test is deleted. A component test replaces one modal with another at phone width and asserts where focus lands.

## Evidence

Filled at landing: what ran and where its output is.
