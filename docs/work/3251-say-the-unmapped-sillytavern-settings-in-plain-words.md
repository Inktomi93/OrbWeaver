---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: import
plan: cross-surface-consistency
---

# Say the unmapped SillyTavern settings in plain words in the profile folder report

## What

The reasons for an unmapped SillyTavern preset field are written in internal vocabulary at their source: DROPPABLE_FIELDS and the 'not a field orb recognises — no orb seat' line in packages/contracts/src/preset/index.ts, and the extension-state reason in packages/server/src/primitives/serde/preset/index.ts. The Presets page import now rewrites them in the preset import verb (packages/server/src/domain/preset/verbs/import-file.ts), but the profile folder import report still prints the internal wording.

## Why

Two doors say one fact in two vocabularies, and the plain one lives in a table beside the verb instead of at the source of the reasons.

## Done when

The reasons are plain at their source, the preset import verb keeps no table of its own, and the report test and the contract test for the reasons assert the new wording.

## Evidence

Filled at landing: what ran and where its output is.
