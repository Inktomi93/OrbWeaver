---
kind: work
status: blocked
updated: 2026-09-23
priority: P1
area: docs
blocked: on 1
plan: doc-migration
---

# ADR prose cleanup D121 to D163

## What

The same pass as the first cleanup item, over files 0121 to 0163. These rulings are the section-shaped ones with verbatim owner quotes; keep the ruling, drop the quote unless it is the ruling's only precise statement, and never a date beside it.

## Why

About 40% of the rows carry history markers, so the split lands them red under writing rule 1. The red is the to-do list; there is no grandfather exemption.

## Done when

`pnpm check:agents` reports no finding under `docs/adr/`.

## Evidence

Filled at landing: what ran and where its output is.
