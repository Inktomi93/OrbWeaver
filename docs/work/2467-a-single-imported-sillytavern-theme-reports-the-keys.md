---
kind: bug
status: doing
updated: 2026-11-11
priority: P3
area: settings
lane: wt/agent-ab272ed4fef9cc84a
---

# A single imported SillyTavern theme reports the keys it could not place

## What

`packages/server/src/primitives/serde/theme/st.ts` lists the SillyTavern theme keys that found no orb field, so an operator can see what an imported theme carried. The full profile import writes that list into its report. The single-file theme import, `packages/server/src/domain/settings/verbs/import-theme-file.ts`, returns only the created flag and the theme's name, so a theme imported through the file picker says nothing about what was dropped.

## Why

A user who imports one theme and sees custom styling missing has no way to learn that the importer dropped it on purpose.

## Done when

The single-file import returns the leftover keys and the theme import surface shows them, or the item records the ruling that only the profile import reports them and the source header says so. `tests/server/domain/settings/verbs/import-theme-file.int.test.ts` asserts whichever holds.

## Evidence

Filled at landing: what ran and where its output is.
