---
kind: tooling
status: open
updated: 2026-11-06
priority: P3
area: tooling
---

# Doc edit takes an evidence section

## What

Add --evidence to pnpm doc edit, with the same judged write path as the other sections.

## Why

Two lanes had to edit the Evidence section by hand, which is the hand edit the verb exists to replace.

## Done when

pnpm doc edit <id> --evidence <text> replaces that section, and the orchestrator's Work board table names the flag.

## Evidence

Filled at landing: what ran and where its output is.
