---
kind: work
status: done
updated: 2026-09-23
priority: P1
area: docs
plan: doc-migration
evidence: c80f0bcda
---

# ADR prose cleanup D61 to D120

## What

The same pass as the first cleanup item, over files 0061 to 0120. This range holds the long multi-part rulings (the UI revamp ruling and the parity-plus program), so expect to split a ruling that carries several independent decisions into several ADRs, each superseding nothing and cited by the original id's successor note.

## Why

About 40% of the rows carry history markers, so the split lands them red under writing rule 1. The red is the to-do list; there is no grandfather exemption.

## Done when

`pnpm check:agents` reports no finding under `docs/adr/` for files 0061 to 0120, including the size cap.

## Evidence

Filled at landing: what ran and where its output is.
