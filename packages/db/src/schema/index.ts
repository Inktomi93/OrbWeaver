// @orb/db/schema — THE BARREL (the db-structure gate's source of truth). EVERY schema file MUST be
// re-exported here: a file missing from this barrel is silently dropped from `typeof schema`, so its
// tables vanish from migrations AND from the drizzle relational query API. When a Wave-1 slice replaces
// a stub, its tables become live automatically through these re-exports — no edit needed here.
//
// `client.ts` imports this as `* as schema` to type `Db = LibSQLDatabase<typeof schema>`; the test
// freshDb helper imports it to push the DDL. The list is ALPHABETICAL (biome's import-organize sorts it)
// and MUST stay complete — all 20 schema files + relations. Reserved cross-cutting: users, audit,
// relations. Wave-1 producers: everything else (currently stubs).

export * from "./agent-principals";
export * from "./assets";
export * from "./audit";
export * from "./buddy";
export * from "./character";
export * from "./chat";
export * from "./credentials";
export * from "./discovery";
export * from "./embeddings";
export * from "./gallery";
export * from "./imagery";
export * from "./notifications";
export * from "./persona";
export * from "./preset";
export * from "./rate-limit";
export * from "./relations";
export * from "./sdk-session";
export * from "./sessions";
export * from "./settings";
export * from "./stats";
export * from "./tag";
export * from "./users";
export * from "./workloads";
export * from "./world-info";
