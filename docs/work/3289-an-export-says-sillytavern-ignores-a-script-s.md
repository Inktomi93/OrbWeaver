---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: client
plan: import-robustness
---

# An export says SillyTavern ignores a script's author scope

## What

An exported script writes its author scope in the native fields only. SillyTavern's spelling cannot hold one, so SillyTavern runs the script on every row. Only the TSDoc in `packages/contracts/src/regex/schemas.ts` says so.

## Why

An owner who shares a scoped script expects it to stay scoped.

## Done when

Exporting a script with an author scope shows one plain line that SillyTavern runs it on every author; a ux review signs the wording.

## Evidence

Filled at landing: what ran and where its output is.
