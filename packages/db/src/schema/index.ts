// @orb/db/schema — THE BARREL (the db-structure gate's source of truth). EVERY schema file MUST be
// re-exported here: a file missing from this barrel is silently dropped from `typeof schema`, so its
// tables vanish from migrations AND from the drizzle relational query API. When a Wave-1 slice replaces
// a stub, its tables become live automatically through these re-exports — no edit needed here.
//
// `client.ts` imports this as `* as schema` to type `Db = LibSQLDatabase<typeof schema>`; the test
// freshDb helper imports it to push the DDL. The list is ALPHABETICAL (biome's import-organize sorts it)
// and MUST stay complete — every schema file + relations. Reserved cross-cutting: users, audit,
// relations. Wave-1 producers: everything else (currently stubs).
//
// ── `json_valid` ON THE JSON COLUMNS: DECIDED, AND THE DECISION IS NO (#1378 item 12) ────────────────
// 72 `mode:"json"` columns across this package carry zero `json_valid(...)` CHECKs. The finding is real
// and its mechanism is worth knowing: byte-level corruption throws inside DRIZZLE'S OWN `JSON.parse` on
// read, BEFORE `kit/parsers.ts`'s zod `.catch()` recovery can see it — so that recovery only ever helps
// the valid-JSON/wrong-shape case, never the corrupt-bytes one.
//
// It is still a POSTURE question rather than a defect, and the posture is unchanged: this package
// deliberately trusts its OWN db files (D20/D23 — functional ownership and centralized mutation seams
// over physical constraints), every writer serialises through drizzle rather than hand-writing text, and
// there is no untrusted producer of these columns. Against that, 72 CHECKs is a real migration cost and a
// permanent per-write validation cost on the hottest tables in the schema (`messages`, `message_variants`,
// `rpg_snapshots`), bought against a failure mode — on-disk byte rot — that a CHECK cannot prevent either,
// since it validates at WRITE time and the corruption happens after. The honest guard for that failure is
// the backup/restore path, which exists.
// REVISIT IF: an external producer ever writes one of these columns directly, or a corrupt-blob read is
// ever actually observed. Until then, recorded and closed — not re-derived.

export * from "./assets.ts";
export * from "./audit.ts";
export * from "./automation.ts";
export * from "./character.ts";
export * from "./chat.ts";
export * from "./connection.ts";
export * from "./connection-bindings.ts";
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
export * from "./refinery.ts";
export * from "./regex.ts";
export * from "./relations.ts";
export * from "./roster-preset.ts";
export * from "./rpg.ts";
export * from "./sdk-session.ts";
export * from "./sessions.ts";
export * from "./settings.ts";
export * from "./stats.ts";
export * from "./tag.ts";
export * from "./users.ts";
export * from "./workloads.ts";
export * from "./world-info.ts";
