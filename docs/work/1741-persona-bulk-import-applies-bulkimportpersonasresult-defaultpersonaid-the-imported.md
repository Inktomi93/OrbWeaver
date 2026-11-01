---
kind: bug
status: open
updated: 2026-11-01
priority: P2
area: server
plan: unwired-code
---

# Persona bulk import applies BulkImportPersonasResult.defaultPersonaId, the imported default flag

## What

A profile import crowns the ST default persona (`BulkImportPersonasResult.defaultPersonaId`) through a settings-owned null-only op, so an existing default is never overwritten.

## Why

The imported default flag was computed and then dropped. The persona rulings say the crown is the user's default and import never changes a chosen value silently, so the import fills only an empty `seeds.defaultPersonaId`.

## Done when

Importing an ST profile with `default_persona` onto an owner with no default sets that persona as default; an owner with a default keeps it.

## Evidence

tests/server/entry/compose/portability-import.suite.int.test.ts: fresh-owner test red on old source (default null), green after; keep-chosen test green both sides.
