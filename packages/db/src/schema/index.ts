// @orb/db/schema — THE BARREL (the db-structure gate's source of truth). EVERY schema file MUST be
// re-exported here: a file missing from this barrel is silently dropped from `typeof schema`, so its
// tables vanish from migrations AND from the drizzle relational query API. When a Wave-1 slice replaces
// a stub, its tables become live automatically through these re-exports — no edit needed here.
//
// `client.ts` imports this as `* as schema` to type `Db = LibSQLDatabase<typeof schema>`; the test
// freshDb helper imports it to push the DDL. The list is ALPHABETICAL (biome's import-organize sorts it)
// and MUST stay complete — every schema file + relations. Reserved cross-cutting: users, audit,
// relations. Wave-1 producers: everything else (currently stubs).

export * from "./assets.ts";
export * from "./audit.ts";
export * from "./automation.ts";
export * from "./character.ts";
export * from "./chat.ts";
export * from "./credentials.ts";
export * from "./databank.ts";
export * from "./discovery.ts";
export * from "./embeddings.ts";
export * from "./gallery.ts";
export * from "./imagery.ts";
export * from "./notifications.ts";
export * from "./persona.ts";
export * from "./plugin.ts";
export * from "./preset.ts";
export * from "./rate-limit.ts";
export * from "./regex.ts";
export * from "./relations.ts";
export * from "./rpg.ts";
export * from "./sdk-session.ts";
export * from "./sessions.ts";
export * from "./settings.ts";
export * from "./stats.ts";
export * from "./tag.ts";
export * from "./users.ts";
export * from "./workloads.ts";
export * from "./world-info.ts";
