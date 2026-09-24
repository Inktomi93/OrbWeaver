// @orb/db — the public barrel. The package is consumed two ways, both DOWNWARD: server persistence
// closes over `Db` + reads the schema tables; the sanctioned bulk serializer (import/export, search,
// discovery) reads the schema rows directly. Domains import the row types off the schema tables here.
//
// Note: the granular subpaths also resolve (`@orb/db/schema`, `@orb/db/kit`) via the package.json
// exports map; this top-level barrel re-exports the surface for the common single-import case.
//
// `./kit` is DELIBERATELY NOT re-exported here (2026-08-02). `Tier-1-DB.md` §Invariants #5 has always
// said "`@orb/db/kit` is also their documented IMPORT PATH", but the barrel re-export made the wrong path
// compile, so half the tree reached `batchMany`/`fetchOwned`/`isConstraintViolation`/`parseStringArrayColumn`
// through `@orb/db` — which reads as "a table-ish thing from the schema barrel" and blurs the one line the
// `own-tables-only` gate keys on (tables are OWNED, kit primitives are legal everywhere). Dropping the
// re-export makes the documented path the ONLY path: `@orb/db/kit` for primitives, `@orb/db` for rows +
// tables + the client.

// The client + lifecycle (Db, createDb, the migration/integrity/backup/housekeeping helpers, LibSqlWrap).
export type { BaselineCheck, Db, DevDbResetForecast, LibSqlWrap, ReadOnlyDb } from "./client/index.ts";
export {
  assertReferentialIntegrity,
  backupBeforeMigrate,
  buildResetDropScript,
  checkBaseline,
  closeDb,
  createDb,
  forecastDevDbReset,
  hasPendingMigrations,
  listBackupFiles,
  localPath,
  optimizeDb,
  preCloseHousekeeping,
  pruneDbBackups,
  resetDevDatabase,
  runMigrations,
  truncateWal,
} from "./client/index.ts";
// The native vector column codec (consumed by the embeddings + discovery schema files).
export { vector32 } from "./custom-types/index.ts";
// Every drizzle table + the relations (the db-row producers).
export * from "./schema/index.ts";
