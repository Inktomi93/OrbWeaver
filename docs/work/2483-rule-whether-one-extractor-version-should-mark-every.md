---
kind: decision
status: open
updated: 2026-11-11
priority: P3
area: server
---

# Rule whether one extractor version should mark every document stale

## What

`EXTRACTOR_VERSION` is one string for every loader. Raising it for a change to the pdf loader makes the databank banner count every uploaded and scraped document as read by an older version, and the re-read sweep visits all of them, though only pdf text changes. The header of the version module records the single stamp as the ruled design.

## Why

The owner is told to re-read documents that cannot change, and a large library pays for the visit.

## Done when

The ruling stands with its reason recorded on this item, or the stamp becomes per format so a loader change marks only its own documents stale, with the sweep test updated.

## Evidence

Filled at landing: what ran and where its output is.
