---
kind: bug
status: open
updated: 2026-11-11
priority: P3
area: docs
---

# The entry tier law names import files that do not exist and inverts the migrate order

## What

docs/law/Tier-5-Entry.md drifted from the disk it declares authoritative in two spots. The Layout block import/ line names run-bundle-import and build-import-context; neither exists (on disk: index.ts, run-profile-dir-import.ts, run-profile-import.ts), and the actual dir-import driver goes unlisted; the bundle-upload route header (http/import.ts) describes a workload-backed flow with no such driver file. Separately, boot-order step 4 lists backupBeforeMigrate before the chain-aware baseline drift check, while entry/boot/migrate.ts header and code run the drift check first and take a backup only when the boot will change the db — the conditional-backup behavior is stronger than the law flat-sequence implies and is only stated in code. The illustrative-list disclaimer covers an omitted seeder, not a named-but-absent file: a cold author grepping run-bundle-import finds nothing. Source: reports/codebase-review/units/server-entry.md.

## Why

The layout block is the map authors place new boot steps and import drivers against; a named file that does not exist mis-states where logic lives, and a law that mis-orders the boot steps hides that the backup is conditional — the boot-critical fact an author reasoning about migration safety needs.

## Done when

The import/ line names the drivers that exist (or drops to the directory role), and step 4 arrows read: baseline drift check, conditional backup, migrations, referential-integrity check.

## Evidence

Filled at landing: what ran and where its output is.
