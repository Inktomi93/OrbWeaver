---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: import
plan: cross-surface-consistency
---

# The refused-scripts line hard-codes its reason

## What

`presetImportScriptsRefused` (`packages/client/src/features/preset/lib/preset-names.ts`) says "too costly to run" and ignores the server's `reason`. Today it is correct, because the write door's only refusal is compile cost (`packages/server/src/domain/regex/persistence/portability-write.ts`). A second refusal kind would make the line false.

## Why

A line that states a reason the data does not carry becomes wrong the day a second reason exists.

## Done when

The line names each refused script with the server's reason, or the contract narrows the refusal to one closed reason the client may name.

## Evidence

Filled at landing: what ran and where its output is.
