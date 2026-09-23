---
kind: work
status: blocked
updated: 2026-09-23
priority: P1
area: docs
blocked: on 1
plan: doc-migration
---

# ADR prose cleanup D1 to D60

## What

For each ADR in the range: cut dates, issue numbers, provenance trails, attribution quotes and comparator archaeology from the body (the ledger-entry style already forbids them); write `## Context`, `## Consequences` and `## Alternatives rejected` where the ruling has them, else delete the "Not recorded" sentence and keep the heading with one honest line; trim any file over the 8 KiB cap; mark a ruling that a later ruling absorbed as `superseded` with `pnpm doc status superseded <old> --by <new>` and move its surviving text into the winner.

## Why

About 40% of the rows carry history markers, so the split lands them red under writing rule 1. The red is the to-do list; there is no grandfather exemption.

## Done when

`pnpm check:agents` reports no finding under `docs/adr/` for files 0001 to 0060; every ADR in the range reads as a standing ruling a cold agent can apply.

## Evidence

Filled at landing: what ran and where its output is.
