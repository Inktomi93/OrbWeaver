---
kind: work
status: open
updated: 2026-11-15
priority: P2
area: import
---

# Import preview lists regex scripts by state with counts

## What

The folder preview prints each preset's scripts as one comma-joined paragraph with a parenthetical verdict on every entry and no per-state counts; a refused script appears under 'left out' behind a JSON path; an invalid pattern is listed as new.

## Why

A preset with dozens of scripts cannot be scanned, so the one refused or broken script is easy to miss.

## Done when

Each preset shows a count line per state and a list grouped by state with not imported first; refused scripts sit in that list with a plain reason and no field path; a pattern that does not compile is marked as not runnable.

## Evidence

Filled at landing: what ran and where its output is.
