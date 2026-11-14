---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: import
plan: import-robustness
---

# The SillyTavern folder run reports files the library already held as held, not skipped

## What

The import-st result (MaintenanceResult: scanned, changed, failed, mergedKeys, found) carries no count of entries the library already held. The client reads asBundleCounts in packages/client/src/features/workloads/lib/portability-model.ts and fills skipped with scanned minus changed minus failed minus merged, so a held entry reads as skipped, which elsewhere means never attempted. The remainder cannot be split honestly from the data the run reports: found counts a group and its chats as separate entries while changed counts only the group chats, found counts the chats of a card that failed, and recorded skips (collected.skipped plus refused groups) sit inside scanned. A correct count needs each wave to report what it reused (card created false, chats deduped, personas total minus created minus merged, worlds, presets, themes, backgrounds, groups, orphans) in found's units, plus the exact never-attempted count, as optional inLibrary and skipped fields on MaintenanceResult (shared by the assets kinds) and in maintenanceResultSchema, then the client reads them and drops the remainder arithmetic.

## Why

A reader who re-imports a SillyTavern folder cannot tell what was added from what the library already had; the same outcome reads as skipped here and as already in your library at every other door.

## Done when

A re-run of an unchanged folder through the import-st run reports its held entries under inLibrary and none under skipped, with the held and skipped counts asserted from the stored workload row in tests/server/domain/import/persistence; the finished-folder summary shows the shared in-library clause (inLibraryClause in packages/client/src/lib/in-library-copy.ts) and a skipped count only for files the run never attempted.

## Evidence

Filled at landing: what ran and where its output is.
