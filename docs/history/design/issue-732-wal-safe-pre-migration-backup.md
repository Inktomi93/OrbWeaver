---
kind: design
status: archived
updated: 2026-08-30
---

# WAL-safe pre-migration backup

## Decision

`backupBeforeMigrate` will create a SQLite-consistent single-file snapshot through the already-open libSQL client with parameter-bound `VACUUM INTO`; `runBootMigrations` will await that snapshot before either `resetDevDatabase` or `runMigrations` can execute.

The artifact keeps the existing `<db>.backup-<epoch-ms>` name. The stamp becomes the newest filesystem modification time across the main database and its live `-wal`, because WAL-only commits do not update the main file. Pin markers, recent/daily retention, orphan-sidecar cleanup, no-op boots, and the launched-mode refusal stay byte-for-byte in their existing control-flow positions.

## Canonical pre-fix path and defect

- `fbef9ebac20a911871bfbe47be4bc789ffb47c81:packages/db/src/client/index.ts:170-179` owns `backupBeforeMigrate`; that implementation copies only the main file and never consults the live connection.
- `fbef9ebac20a911871bfbe47be4bc789ffb47c81:packages/server/src/entry/boot/migrate.ts:45-69` owns the ordered change protocol. The backup call at line 57 precedes the destructive reset at line 67, but it is synchronous and receives only the URL.
- `packages/server/src/entry/lifecycle.ts:263` invokes `runBootMigrations` before service composition, workers, schedulers, and the HTTP listener start. Boot therefore owns the app connection exclusively at this point, but the backup mechanism will not depend on a checkpoint-plus-filesystem-copy gap.
- `packages/db/src/client/index.ts:558` checkpoints only during graceful shutdown. A baseline-reset boot cannot assume that a prior process reached graceful shutdown.
- `tests/server/entry/boot/migrate.int.test.ts:75` pins change-only backup creation and no-op boot behavior; line 151 pins backup-before-reset plus retention; line 175 pins launched refusal.

The pinned `libsql@0.5.29` package declares `Database.backup`, but its shipped implementation throws `not implemented`; `@libsql/client` also keeps the native handle private. That surface is not usable machinery.

## Alternatives

| Alternative | Verdict | Reason |
| - | - | - |
| Checkpoint the live connection, validate the checkpoint result, then copy the main file | Rejected | It can be made safe only by proving `busy=0` and preventing a commit between checkpoint and copy. The boot ordering currently supplies exclusivity, but the split mechanism unnecessarily couples correctness to that wider lifecycle fact and mutates the live WAL before evidence exists. |
| SQLite online backup API | Rejected on the pinned stack | This is the best direct mechanism in SQLite, but the installed native libSQL method is an unimplemented stub and the public app client exposes no native handle. Adding a second SQLite binding or reaching through private fields would duplicate the sanctioned client rail. |
| Copy main + `-wal` + `-shm` as a file trio | Rejected | A sequence of filesystem copies is not one SQLite snapshot; generation mismatch and copy ordering can produce an artifact set that never existed. It also requires a restore protocol and stale-sidecar discipline the current single-path artifact does not carry. |
| `VACUUM INTO` through the live app connection | Chosen | SQLite specifies it as a transactional consistent snapshot of a live database and an alternative to the backup API. The pinned libSQL client executes it successfully with a bound destination path; a probe left a committed row only in WAL, showed a naive main-file copy omitted it, and showed the `VACUUM INTO` artifact contained it. |

Primary mechanism references: [SQLite VACUUM INTO](https://sqlite.org/lang_vacuum.html#vacuum_with_an_into_clause) and [SQLite backup techniques](https://sqlite.org/backup.html#other_backup_techniques).

## Exact semantics

1. Non-file URLs and absent database files still return `undefined` without issuing SQL.
2. A file database derives its stamp from `max(main.mtimeMs, wal.mtimeMs when present)`, rounded exactly as today, and keeps the existing numeric artifact grammar.
3. The live client executes `VACUUM INTO ?` with the artifact path as a bound argument. No path interpolation, bare `sqlite3`, second connection, checkpoint, or live sidecar copy enters the implementation.
4. Success returns the complete standalone artifact path. A destination collision, lock, I/O error, open transaction, or other SQLite failure rejects. The boot caller awaits that result; rejection exits before reset, migration, integrity check, or retention.
5. The launched mismatch refusal remains before backup. A no-op boot still never calls backup or retention. A successful changing boot retains the existing logging and pruning sequence.
6. Retention continues to recognize old backup sidecars, but new artifacts are one database file. Restore assumes the live connection is stopped and the restore target has no stale `-wal`/`-shm`; the regression opens the artifact at its own fresh path through `createDb`, which re-establishes the sanctioned WAL/PRAGMA posture.

## Coupled sites

| Site | Change |
| - | - |
| `packages/db/src/client/index.ts` | Make backup connection-aware and asynchronous; keep export name and retention grammar. |
| `packages/server/src/entry/boot/migrate.ts` | Await the production backup before destructive or migratory work. |
| `tests/db/client.int.test.ts` | Existing focused DB-lifecycle suite; run cold against the changed client. |
| `tests/server/entry/boot/migrate.int.test.ts` | Add the real WAL-residency/restored-artifact regression and failure-before-reset; preserve existing no-op/retention/launched pins. |

No schema, migration baseline, package export, dependency, lifecycle, or retention-budget change is required.

## Red-first and verification plan

1. WAL red: through production `runBootMigrations`, create a fresh real file DB, create a probe table, truncate-checkpoint that DDL, commit the probe row afterward, prove the app connection reads it and the WAL is non-empty, force the regenerated-baseline backup/reset path, open the new artifact through `createDb`, require `integrity_check=ok`, and require the row. The exact canonical source copies only main, so the artifact opens with the table but without the row.
2. Failure red: migrate a real file DB, create a sentinel row, mark the baseline stale, plant a non-empty destination at the exact next backup name, call production `runBootMigrations`, require backup rejection, then require the sentinel and stale migration record still exist. The canonical source overwrites the planted file and resets, so this test fails before the fix.
3. Green: run `tests/db/client.int.test.ts` and `tests/server/entry/boot/migrate.int.test.ts` in the integration project. Existing tests are the planted controls for successful backup, no-op boot, seven-backup retention, reset ordering, and launched refusal.
4. Run scoped package typecheck plus root graph/test-DOM programs required for touched tests, then Biome and ESLint only on touched TypeScript files. Do not run full/static/structure/check-gates/hooks.
