---
kind: work
status: open
updated: 2026-09-23
priority: P2
area: tooling
---

# Adjudicate each waiver, reviewed grant and foreign suppression from the exception-authority audit

## What

Build the exception census from the current tree: every ordinary `@orb-waive` marker, every reviewed grant, and every foreign suppression (Biome, ESLint, `@ts-expect-error`). Work in batches by policy family. The largest families are `caught-failure-ownership`, `no-test-fabrication` and `ct-no-oneshot-live-read-assert`. Give every item one disposition: repair, preserve with evidence, owner decision, tool-reader defect or superseded. Record the results in `docs/work` items. Repair each item whose disposition is repair.

## Why

The exception-authority audit only proved how many ordinary waivers, reviewed grants and foreign suppressions exist and where they sit. It did not judge whether any single one is still justified. Until each item is adjudicated, a stale or unauthorized exception can keep hiding a real defect from the gates, and the audit finding cannot close.

## Done when

Every waiver, grant and foreign suppression in the census has one of the five dispositions, recorded in a work item. Each repair has landed. Each owner decision is its own `decision` item.

## Evidence

Filled at landing: what ran and where its output is.
