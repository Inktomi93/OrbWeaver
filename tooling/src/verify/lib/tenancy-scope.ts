// Shared TENANCY-CLASS reader: reads the drizzle schema fact's already-resolved `SchemaModel` for the two
// questions `table-scoping-class` (its own coherence check) and the `owner-scoped-{reads,writes,upserts}`
// family all need answered IDENTICALLY — "which drizzle table identifiers are ownerId-scoped" (answered from the
// registry below) and "every declared table identifier" (the denominator that tells a
// non-owner-scoped table from an UNREADABLE one, `tenancy-read.ts`'s `tableTargetOf`).
//
// Extracted 2026-09-11 (#1584, gate-runtime-standardization) from a raw `ctx.project.getSourceFiles()`
// walk that lived inside `gates/table-scoping-class.ts` and was imported by three sibling gates — forbidden
// under the final contract's shared-query boundary (no gate-owned Project walk, no gate-owned registry
// consumed by siblings through a re-walk). The walk now happens exactly ONCE per invocation, inside the
// shared `drizzleSchemaFact`, regardless of how many policies declare `facts: [drizzleSchemaFact]`.
//
// THE CLASSIFICATION REGISTRY IS NOW HERE, AND THE RULING THAT KEPT IT OUT SURVIVES — ITS INPUT CHANGED.
// This paragraph used to read: "THE CLASSIFICATION REGISTRY ITSELF STAYS IN `gates/table-scoping-class.ts`,
// DELIBERATELY, NOT HERE: it is RULING DATA (Constitution.md §1 "ownership is INHERITED, not stamped"; D18/D20/D23)
// keyed by snake_case SQL table names, and `biome.json` turns `useNamingConvention` off for
// `tooling/src/verify/gates/**` but NOT for `tooling/src/verify/lib/**` — moving the table here would
// either rename 87 SQL-name keys away from the schema's own vocabulary or force a lib-wide lint carve-out
// for one table's data." It is kept verbatim rather than deleted because the REASONING was correct and is
// the record of why the data lived in a gate module at all.
//
// What dissolved it: the owner banned gate-to-gate imports on 2026-09-12 (#2096 / §12.3 — a shared
// predicate moves to `lib/<family>.ts`), which made the old arrangement unavailable, and the ruled repair
// (arm 3) changes the DATA SHAPE rather than the lint or the vocabulary. The table names are now VALUES on
// a record (`{ table: "automation_rules", … }`), not object KEYS, and `useNamingConvention` judges keys —
// so the SQL vocabulary is preserved exactly, no key is renamed, and no suppression or override widening
// was needed. Verified by a planted two-sided probe in this directory before the move: the key-shaped
// declaration errored on `automation_rules`, the record-array shape did not, in one invocation.
//
// THE CENSUS IS NOT WRITTEN HERE, ON PURPOSE (#2179). Until 2026-09-13 this header carried a census dated
// 2026-08-08 ("87 tables — 23 ownerId · 19 membership · 16 junction · 24 parent · 5 global" — the same 87 the
// verbatim paragraph above cites as "87 SQL-name keys"), which had already been a repair of an earlier
// drift, and which a 2026-09-12 re-derivation found ten tables stale — while the
// REGISTRY matched the live schema exactly the whole time. The two-sided ratchet polices the SET; nothing
// polices a hand-written count OF that set, so any number written here rots on the schedule of schema
// change. The authoritative answers are therefore the ones a machine computes, never a sentence:
//   · total and per-class split — `TABLE_SCOPING_ROWS` below, grouped by `scope`
//     (re-derive from the repo root: `node -e 'import("./tooling/src/verify/lib/tenancy-scope.ts").then((m) =>
//     console.log(m.TABLE_SCOPING_ROWS.length, Object.entries(Object.groupBy(m.TABLE_SCOPING_ROWS,
//     (row) => row.scope)).map(([scope, rows]) => scope + "=" + rows.length)))'`);
//   · registry = schema, both directions — `table-scoping-class`'s UNCLASSIFIED/STALE arms over the real
//     `drizzleSchemaFact` on every structure run, pinned in both directions by the RATCHET SIDE tests in
//     `tests/tooling/verify/gates/tenancy-scope-family.suite.test.ts`, which assert relative to the row array
//     rather than a literal (pinning a count would make adding a table a red proof).
// Re-derived 2026-09-13 with the command above: the registry and `sqliteTable(` declarations under
// `packages/db/src/schema/**` agree in size — a dated observation, not a figure to maintain.
//
// THE FAMILY'S POPULATION PORT IS DERIVED ONCE HERE (§5b.5), so the three call-shape members cite one
// measurement instead of copying it three times — the `DRIZZLE_SCHEMA_POPULATION` precedent, which this
// family's fourth member consumes directly. All four converted in ONE commit, `b54b2c34e`, so the legacy
// sha is its parent `40223a0915eda72dd8ab35fbdeaf9e9892089717` for every member.
//   `owner-scoped-{reads,writes,upserts}`: legacy `scanRoot: (p) => p.includes("packages/server/src/")`
//   becomes `@server`, which IS `packages/server/src/` — the same set. The only difference is that
//   `includes(` matched the segment ANYWHERE in a path while the population root is ANCHORED at its start,
//   and on this tree that distinction is empty: 1560 tracked paths contain `packages/server/src/` and the
//   same 1560 begin with it.
//   `table-scoping-class`: legacy `scanRoot: (p) => p.includes("packages/db/src/schema/")` becomes
//   `DRIZZLE_SCHEMA_POPULATION` (`{ in: ["@db"], under: ["packages/db/src/schema/**"] }`), again the same
//   set under the same anchoring difference — 30 tracked paths contain the segment and the same 30 begin
//   with it. That member therefore declares the DRIZZLE-SCHEMA family's shared population while belonging
//   to THIS family: the classification data is tenancy's, the files it reads are the schema's, and the two
//   are deliberately not merged.
import type { SchemaModel, SchemaTable } from "../contract/schema-fact.ts";
import type { ScopingRow, TableShape } from "../contract/tenancy-scope.ts";
import { TABLE_SCOPING_ROWS } from "./tenancy-scope-rows.ts";

/** The reviewed per-table classification, authored in `./tenancy-scope-rows.ts` and re-exported here so
 *  the four family policies keep ONE import path (and every citation of `lib/tenancy-scope.ts` as the
 *  registry's home stays true). The split is the 450-line cap; the ruling above is unchanged. */
// biome-ignore lint/performance/noBarrelFile: re-export preserves the original module's public API after extracting the row registry to a sibling
export { TABLE_SCOPING_ROWS } from "./tenancy-scope-rows.ts";

/** THE ONE READER. Built once per call into a Map so every consumer keys on the same object, and so the
 *  array stays the authored shape while lookups stay O(1). All four policies — `table-scoping-class` and
 *  the three `owner-scoped-*` — go through this or through the two derivations below; none of them sees
 *  the array directly, which is what keeps "what is this table's class" a single answer. */
export function tableScopingClasses(): ReadonlyMap<string, ScopingRow> {
  return new Map(TABLE_SCOPING_ROWS.map((row) => [row.table, row]));
}

const OWNER_COL = "ownerId";
const CHAT_COL = "chatId";

/** The shape facts `table-scoping-class`'s own coherence check judges a row's declared class against. */
export function tableShapeOf(table: SchemaTable): TableShape {
  let hasOwnerId = false;
  let hasChatId = false;
  let fkCount = 0;
  for (const column of table.columns) {
    hasOwnerId ||= column.identity.propertyName === OWNER_COL;
    hasChatId ||= column.identity.propertyName === CHAT_COL;
    if (column.foreignKey !== null) {
      fkCount += 1;
    }
  }
  return { hasOwnerId, hasChatId, fkCount };
}

function tableIdents(model: SchemaModel, keep: (table: SchemaTable) => boolean): ReadonlySet<string> {
  const idents = new Set<string>();
  for (const table of model.tables) {
    if (keep(table)) {
      idents.add(table.identity.declarationName);
    }
  }
  return idents;
}

/** The drizzle table IDENTIFIERS whose SQL table the caller's classifier accepts (`table-scoping-class`'s
 *  own (a)-class predicate) — derived per run from the schema model, never a hand-kept list, so a
 *  re-classification moves every consumer at once. ONE home for the WALK: `owner-scoped-reads`,
 *  `owner-scoped-writes`, and `owner-scoped-upserts` import this reader directly, and each keeps its
 *  OWN blindness tripwire (an empty set means the
 *  derivation went blind, never that the tree is clean). */
export function ownerScopedTableIdents(model: SchemaModel): ReadonlySet<string> {
  const classes = tableScopingClasses();
  return tableIdents(model, (table) => classes.get(table.sqlName)?.scope === "ownerId");
}

/** The drizzle table IDENTIFIERS of the (b) MEMBERSHIP class — the tables whose scope resolves through
 *  `chat_participants` rather than through an `ownerId` stamp, so every row of one is state MORE THAN ONE
 *  human can see. Same derivation and same home as `ownerScopedTableIdents` above, read by
 *  `membership-write-fan` (#1734): a re-classification of a table moves the owner half and the membership
 *  half in one edit, and neither can be hand-kept out of step with the other. */
export function membershipScopedTableIdents(model: SchemaModel): ReadonlySet<string> {
  const classes = tableScopingClasses();
  return tableIdents(model, (table) => classes.get(table.sqlName)?.scope === "membership");
}

/** EVERY drizzle table identifier the schema declares, regardless of class — the DENOMINATOR the tenancy
 *  write halves need. Without it "this identifier is not an (a) table" and "I could not read this identifier
 *  at all" are the same answer, and the second one is a bypass wearing the first one's clothes. Same
 *  derivation, same home: a table that stops being declared leaves both sets at once. */
export function schemaTableIdents(model: SchemaModel): ReadonlySet<string> {
  return tableIdents(model, () => true);
}

// biome-ignore lint/performance/noBarrelFile: re-export preserves the original module's public API after extracting reportBlindWhenEmpty to a sibling
export { reportBlindWhenEmpty } from "./tenancy-scope-blind.ts";
