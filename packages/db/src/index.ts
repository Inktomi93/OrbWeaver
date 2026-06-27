// @orb/db — the public barrel. The package is consumed two ways, both DOWNWARD: server persistence
// closes over `Db` + reads the schema tables; the sanctioned bulk serializer (import/export, search,
// discovery) reads the schema rows directly. Domains import the row types off the schema tables here.
//
// Note: the granular subpaths also resolve (`@orb/db/schema`, `@orb/db/kit`) via the package.json
// exports map; this top-level barrel re-exports the surface for the common single-import case.

// The client + lifecycle (Db, createDb, the migration/integrity/backup/housekeeping helpers, LibSqlWrap).
export * from "./client";
// The native vector column codec (consumed by the embeddings + discovery schema files).
export { vector32 } from "./custom-types";
// The db-layer primitives (batch bridge, constraint classifier, fetchOwned, insert chunker, parsers).
export * from "./kit";
// Every drizzle table + the relations (the db-row producers).
export * from "./schema";
