---
kind: decision
status: open
updated: 2026-11-12
priority: P3
area: server
plan: stored-data-integrity
---

# Rule whether one extractor version should mark every document stale

## What

`EXTRACTOR_VERSION` is one string for every loader. Raising it for a change to the pdf loader makes the databank banner count every uploaded and scraped document as read by an older version, and the re-read sweep visits all of them, though only pdf text changes. The header of the version module records the single stamp as the ruled design.

## Why

The owner is told to re-read documents that cannot change, and a large library pays for the visit.

## Done when

Owner ruling: the stamp becomes per format. A loader change marks only its own documents stale, the databank banner counts only those, and the sweep test proves a pdf loader bump leaves other formats untouched.

## Evidence

Filled at landing: what ran and where its output is.
