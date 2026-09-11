// Shared TENANCY-CLASS reader: reads the drizzle schema fact's already-resolved `SchemaModel` for the two
// questions `table-scoping-class` (its own coherence check) and the `owner-scoped-{reads,writes,upserts}`
// family all need answered IDENTICALLY — "which drizzle table identifiers are ownerId-scoped" (crossed with
// the caller-supplied classifier) and "every declared table identifier" (the denominator that tells a
// non-owner-scoped table from an UNREADABLE one, `tenancy-read.ts`'s `tableTargetOf`).
//
// Extracted 2026-09-11 (#1584, gate-runtime-standardization) from a raw `ctx.project.getSourceFiles()`
// walk that lived inside `gates/table-scoping-class.ts` and was imported by three sibling gates — forbidden
// under the final contract's shared-query boundary (no gate-owned Project walk, no gate-owned registry
// consumed by siblings through a re-walk). The walk now happens exactly ONCE per invocation, inside the
// shared `drizzleSchemaFact`, regardless of how many policies declare `facts: [drizzleSchemaFact]`.
//
// THE CLASSIFICATION REGISTRY ITSELF STAYS IN `gates/table-scoping-class.ts`, DELIBERATELY, NOT HERE: it is
// RULING DATA (AGENTS §1 "ownership is INHERITED, not stamped"; D18/D20/D23) keyed by snake_case SQL table
// names, and `biome.json` turns `useNamingConvention` off for `tooling/src/verify/gates/**` but NOT for
// `tooling/src/verify/lib/**` — moving the table here would either rename 87 SQL-name keys away from the
// schema's own vocabulary or force a lib-wide lint carve-out for one table's data. `table-scoping-class.ts`
// exports its own `ownerScopedTableIdents`/`schemaTableIdents` wrappers that close over its registry and
// call the generic derivations below, so the WALK has one home and the DATA keeps its natural one.
import type { GatePolicyContext } from "../contract/policy.ts";
import type { ReadySchemaFact, SchemaModel, SchemaTable } from "../contract/schema-fact.ts";

/** The derived facts one `sqliteTable(…)` declaration exposes — read off the shared `drizzleSchemaFact`
 *  model instead of a second hand-rolled AST walk over the raw column object literal. */
export interface TableShape {
  readonly hasOwnerId: boolean;
  readonly hasChatId: boolean;
  readonly fkCount: number;
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
 *  `owner-scoped-writes`, and `owner-scoped-upserts` all key their (a)-set on this (through
 *  `table-scoping-class.ts`'s wrapper), and each keeps its OWN blindness tripwire (an empty set means the
 *  derivation went blind, never that the tree is clean). */
export function ownerScopedTableIdents(model: SchemaModel, isOwnerScoped: (sqlName: string) => boolean): ReadonlySet<string> {
  return tableIdents(model, (table) => isOwnerScoped(table.sqlName));
}

/** EVERY drizzle table identifier the schema declares, regardless of class — the DENOMINATOR the tenancy
 *  write halves need. Without it "this identifier is not an (a) table" and "I could not read this identifier
 *  at all" are the same answer, and the second one is a bypass wearing the first one's clothes. Same
 *  derivation, same home: a table that stops being declared leaves both sets at once. */
export function schemaTableIdents(model: SchemaModel): ReadonlySet<string> {
  return tableIdents(model, () => true);
}

const SCHEMA_BARREL = "packages/db/src/schema/index.ts";

/** The shared "blind derivation" arm all three owner-scoped-* gates carry: an empty (a)-class set means the
 *  schema shape or the registry moved and the gate now matches nothing, which would otherwise report ✓
 *  forever. Guarded on the real schema barrel actually being in the loaded population, exactly like
 *  `own-tables-only`'s real-tree anchor — a conformance mini-project carries neither the full schema nor the
 *  full server tree, and would "prove" the derivation blind. */
export function reportBlindWhenEmpty(
  ctx: GatePolicyContext,
  schemaFact: ReadySchemaFact<SchemaModel>,
  ownerTableIdents: ReadonlySet<string>,
  message: string,
): void {
  if (!schemaFact.receipt.paths.includes(SCHEMA_BARREL) || ownerTableIdents.size > 0) {
    return;
  }
  const anchor = ctx.files[0];
  if (anchor === undefined) {
    throw new Error("owner-scoped gate received an empty effective population");
  }
  ctx.report.file(ctx.relativePath(anchor), { message });
}
