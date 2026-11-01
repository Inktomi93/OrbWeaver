---
kind: tooling
status: open
updated: 2026-11-01
priority: P3
area: tooling
plan: surface-walk
---

# Design audit cohort-anatomy measures band rows, not disclosure wrappers, so an open settings group is not a finding

## What

The design audit's cohort-anatomy rule compares rows that share an anatomy, measuring each band rather than its disclosure wrapper, so an open settings group is not a finding.

## Why

An open Settings group is taller by design: its body holds the subcategory rows, and the audit reports it as a P2 on every run.

## Done when

`--design-audit` on the Settings list with a group open reports no cohort-anatomy finding, and a planted band of the wrong height still does.

## Evidence

Filled at landing: what ran and where its output is.
