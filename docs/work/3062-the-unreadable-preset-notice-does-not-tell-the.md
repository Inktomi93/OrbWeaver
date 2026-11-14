---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: import-robustness
---

# The unreadable-preset notice does not tell the owner to import a file over the preset

## What

`packages/client/src/lib/stored-config-unreadable-copy.ts` tells the owner to import a preset file over an unreadable preset. An import never edits an owned preset: an equal file is already in the library and a different one is added under a new name (D290).

## Why

The owner follows the notice, gets a second preset, and the unreadable one is still there.

## Done when

The notice states a step that works: what the owner can do with the unreadable preset and that an import adds a new one. No test asserts the sentence.

## Evidence

Filled at landing: what ran and where its output is.
