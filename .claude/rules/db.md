---
paths:
  - packages/db/**
---

# Database

## Schema changes are forward migrations

The baseline is frozen. Never edit, regenerate, or move the baseline or an applied migration.
Fix a mistake with a new migration.

1. Edit the schema file, then run
   `pnpm --filter @orb/db exec drizzle-kit generate --name <what-changed> --config=drizzle.config.ts`.
2. Commit the generated SQL, snapshot, and journal. Review the SQL by hand.
3. Put any data backfill in the same migration file, after the DDL.
4. Run `pnpm check:drizzle-kit`, `pnpm check:db-baseline`, and a scoped `biome --write` on the
   meta files.
5. Read the `[verify-notice]` line in the output. A green run can still carry a boot refusal.

A pre-launch drift check compares the applied migration against every shipped chain entry, not
only the newest, or the first forward migration boot-bricks as fatal.

`pnpm seed:demo --fresh` is the only wipe. Never open the live db with the `sqlite3` CLI while
the server runs; it can checkpoint and delete the WAL out from under libSQL. Read live state
through the app or an immutable copy.

## Writes

- `db.transaction` is banned. `batchMany` is the one atomic unit and bans a `SELECT` ahead of
  writes. Guard a race with a scalar subquery in the write statement, or accept the batch's own
  latency as the check window.
- `INSERT ... SELECT` renders projection columns unqualified. Spell correlated subquery columns
  as `` sql`${table}.${sql.identifier(name)}` `` and dump the generated SQL to check.
- `UPDATE ... RETURNING` reports post-update values on SQLite. Read, then clear, in two
  statements, never one.
- Upsert against a partial unique index needs `onConflictDoUpdate` with `targetWhere` and an
  identity set; `onConflictDoNothing` cannot target it.
- A junction keyed only by parent and content-addressed asset id loses rows when two names share
  identical bytes. Key on parent, asset id, and name, with an empty-string sentinel, never null.
- A JSON column typed `Record<string, unknown>` or `unknown` lets a reader outrun its producer.
  Close the type with a shape both sides import.
- A `Required<$inferInsert>` column allow-list names a column, not what is inside it. Give a JSON
  column its own exhaustive object-literal check with no spread.
- Before stating a biconditional between two columns, enumerate every writer of both, including
  security or projection strips.
- A refine on a parse-on-read schema bricks already-stored rows. Put coherence checks at the
  write-producing verb, not the reader's schema.
- A new table needs more than the schema file: `ASSET_REFS` if it holds an `AssetId`, the
  table-scoping-class check, the suppression/freshness registries, and a test per verb.
- A `stats` rollup column stores the raw delta and only accumulates on conflict, so a negative delta on
  a fresh row inserts negative. Never add a non-negative CHECK constraint on a stats counter column.
