---
kind: tooling
status: open
updated: 2026-11-12
priority: P2
area: tooling
plan: checked-law
---

# Kept-site rulings in the UI census cite a law section or a decision

## What

The keptSites rulings in tooling/src/ui-facts/cohorts.ts, forms.ts and copy.ts keep a deviation out of the census findings. Most give a reason that cites only a file header or a code comment: the list pane empty and focus columns for the config, corpus and labels list surfaces, the form fit and dismiss columns for the add-connection provider fields, and the chip wire column for the template drill-in. The list with each path and what it cites is in the overlay lane's drafted items under reports/lanes.

## Why

A ruling that keeps a deviation without a cited authority acts as a waiver, and the owner's rule is that a deliberate exception cites a law line or a ledger decision.

## Done when

Every keptSites reason names a law section or an ADR id, or the entry is gone and its site no longer deviates. A test fails a keptSites entry whose reason cites neither.

## Evidence

Filled at landing: what ran and where its output is.
