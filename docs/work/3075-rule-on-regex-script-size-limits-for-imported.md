---
kind: decision
status: open
updated: 2026-11-14
priority: P1
area: import
plan: import-robustness
---

# Rule on regex script size limits for imported presets

## What

`MAX_REPLACE_LENGTH` is 10,000 in `packages/contracts/src/regex/schemas.ts` and `MAX_FIND_REGEX_LENGTH` is 2,048 in `packages/kit/src/regex/index.ts`. The find limit is shared by the executor, which refuses a longer pattern before it compiles one, and by the storage schema; the replace limit states no reason in the code. Many of the Sola preset's scripts exceed one of them, and they are its main panels: its largest replacement is 24,648 characters and its largest find pattern 10,189. Decide whether to raise the limits, and state the reason each limit exists before changing it (D213 owns the script library's storage).

## Why

With today's limits the largest panels of a popular preset cannot be stored even once its scripts import.

## Done when

A ruling names the limits and their reason, and a refused script is reported by name with the limit it broke.

## Evidence

Filled at landing: what ran and where its output is.
