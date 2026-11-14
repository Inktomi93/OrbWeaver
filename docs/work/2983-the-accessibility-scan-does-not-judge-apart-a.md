---
kind: bug
status: open
updated: 2026-11-14
priority: P2
area: client
---

# The accessibility scan does not judge apart a clickable list row's name mismatch

## What

A clickable ListRow keeps its title in an aria-hidden span and its subtitle and meta in aria-describedby targets. The in-page Label-in-Name judge in tests/support/browser/accessible-names.ts strips both, so no shown word is left and labelInNamePasses refuses the row. The vendor label-content-name-mismatch rule flags every subtitled row (the row's name is the title, the visible text adds the subtitle), and accessibilityEvidence in tests/support/browser/accessibility-scan.ts leaves it a violation instead of judging it apart. surfaceCheckpoint in tests/support/browser/surface-checkpoint.ts fails on every remaining violation, so a walked surface that shows a subtitled row reads red for a split the list row header rules is correct.

## Why

The list row header in packages/ui/src/primitives/list-row/list-row\.tsx accepts this vendor finding and judges it apart. A gate that fails on it contradicts that ruling and hides real findings behind a known one.

## Done when

A clickable ListRow with a subtitle mounted through the real primitive is judged apart by the scan (needs-review, vendor result unchanged) and tests/support/browser/accessibility-scan.ct.tsx holds the case; a control whose name drops a shown word still fails.

## Evidence

Filled at landing: what ran and where its output is.
