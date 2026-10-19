// Shared tenancy-class reader for the owner-scoped-* and membership-write-fan gates: which table identifiers of
// the shared `drizzleSchemaFact` model are in a scoping class, read from `TABLE_SCOPING` in `@orb/db/tenancy`,
// and every declared identifier, the denominator that tells another class from an unreadable target.
import { TABLE_SCOPING } from "@orb/db/tenancy";
import type { SchemaProjectedModel, SchemaProjectedTable } from "../../floor/code-facts/schema-projection-contract.ts";
import type { SchemaForeignKey } from "../contract/schema-fact.ts";
import type { SchemaTableIndex } from "../contract/tenancy.ts";
import type { ScopingRow } from "../contract/tenancy-scope.ts";

/** THE ONE READER: each table's class keyed by its SQL name, the name the schema fact reports. Every family
 *  policy goes through this or the derivations below, so "what is this table's class" has one answer. */
export function tableScopingClasses(): ReadonlyMap<string, ScopingRow> {
  return new Map(Object.values(TABLE_SCOPING).map(({ sqlName, scope, why }) => [sqlName, { table: sqlName, scope, why }]));
}

/** The separator between the child and parent column keys of one {@link foreignKeyEdges} entry. */
export const EDGE_ARROW = "->";

function tableIdents(model: SchemaProjectedModel, keep: (table: SchemaProjectedTable) => boolean): ReadonlySet<string> {
  const idents = new Set<string>();
  for (const table of model.tables) {
    if (keep(table)) {
      idents.add(table.identity.declarationName);
    }
  }
  return idents;
}

/** The drizzle table IDENTIFIERS of the (a) ownerId class — derived per run from the schema model, never a
 *  hand-kept list, so a re-classification moves every consumer at once. ONE home for the WALK:
 *  `owner-scoped-reads`, `owner-scoped-writes`, and `owner-scoped-upserts` import this reader directly, and
 *  each keeps its OWN blindness tripwire (an empty set means the derivation went blind, never that the tree
 *  is clean). */
export function ownerScopedTableIdents(model: SchemaProjectedModel): ReadonlySet<string> {
  const classes = tableScopingClasses();
  return tableIdents(model, (table) => classes.get(table.sqlName)?.scope === "ownerId");
}

/** The drizzle table IDENTIFIERS of the (b) MEMBERSHIP class — the tables whose scope resolves through
 *  `chat_participants` rather than through an `ownerId` stamp, so every row of one is state MORE THAN ONE
 *  human can see. Same derivation and same home as `ownerScopedTableIdents` above, read by
 *  `membership-write-fan` (#1734): a re-classification of a table moves the owner half and the membership
 *  half in one edit, and neither can be hand-kept out of step with the other. */
export function membershipScopedTableIdents(model: SchemaProjectedModel): ReadonlySet<string> {
  const classes = tableScopingClasses();
  return tableIdents(model, (table) => classes.get(table.sqlName)?.scope === "membership");
}

/** EVERY drizzle table the schema declares, regardless of class — the DENOMINATOR the tenancy readers need.
 *  Without it "this identifier is not an (a) table" and "I could not read this identifier at all" are the same
 *  answer, and the second one is a bypass wearing the first one's clothes. The SQL-name map is what a typed
 *  table reference (a parameter typed `typeof chatTags | typeof characterTags`) resolves through. */
export function schemaTableIndex(model: SchemaProjectedModel): SchemaTableIndex {
  return {
    idents: tableIdents(model, () => true),
    identBySqlName: new Map(model.tables.map((table) => [table.sqlName, table.identity.declarationName])),
  };
}

/** One end of a foreign-key edge as {@link foreignKeyEdges} keys it: the table's declared identifier and the
 *  column's property name, the two names a drizzle column read (`personas.id`) resolves to. */
export function foreignKeyColumnKey(tableIdent: string, propertyName: string): string {
  return `${tableIdent}.${propertyName}`;
}

interface ForeignKeyPair {
  readonly childTable: string;
  readonly childColumn: string;
  readonly parentTable: string;
  readonly parentColumn: string;
}

function parentEnd(parent: SchemaForeignKey["parent"]): { readonly table: string; readonly column: string } {
  return parent.kind === "population-column"
    ? { table: parent.column.table.declarationName, column: parent.column.propertyName }
    : { table: parent.exportedTable, column: parent.propertyName };
}

/** Every declared foreign key, from both the column-level `.references()` and the table-level `foreignKey()` forms. */
function foreignKeyPairs(model: SchemaProjectedModel): readonly ForeignKeyPair[] {
  return model.tables.flatMap((table) => [
    ...table.columns.flatMap((column) => {
      if (column.foreignKey === null) {
        return [];
      }
      const parent = parentEnd(column.foreignKey.parent);
      return [
        { childTable: table.identity.declarationName, childColumn: column.identity.propertyName, parentTable: parent.table, parentColumn: parent.column },
      ];
    }),
    ...table.foreignKeys.flatMap((foreignKey) =>
      foreignKey.children.flatMap((child, index) => {
        const declared = foreignKey.parents[index];
        const parent = declared === undefined ? undefined : parentEnd(declared);
        return parent === undefined
          ? []
          : [{ childTable: child.table.declarationName, childColumn: child.propertyName, parentTable: parent.table, parentColumn: parent.column }];
      }),
    ),
  ]);
}

/** Every declared foreign key as `child->parent` column keys. This is the edge set the FK-chain inheritance
 *  (Spine-Identity-and-Auth §2b) walks: a joined owner-scoped table inherits a bound row's scope only along an
 *  edge that points AT it. */
export function foreignKeyEdges(model: SchemaProjectedModel): ReadonlySet<string> {
  return new Set(
    foreignKeyPairs(model).map(
      (pair) => `${foreignKeyColumnKey(pair.childTable, pair.childColumn)}${EDGE_ARROW}${foreignKeyColumnKey(pair.parentTable, pair.parentColumn)}`,
    ),
  );
}

/** The scope-bearing parents of every DERIVED table (class `parent` or `junction`, D23): the ownerId- or
 *  membership-class tables its foreign keys reach. A chain through a derived table scopes the parent it joins
 *  only when the read also pins another of these parents to the caller (Spine-Identity-and-Auth §2b). */
export function scopeParentsOfDerivedTables(model: SchemaProjectedModel): ReadonlyMap<string, ReadonlySet<string>> {
  const classes = tableScopingClasses();
  const classByIdent = new Map(model.tables.map((table) => [table.identity.declarationName, classes.get(table.sqlName)?.scope]));
  const parents = new Map<string, Set<string>>();
  for (const pair of foreignKeyPairs(model)) {
    const childClass = classByIdent.get(pair.childTable);
    const parentClass = classByIdent.get(pair.parentTable);
    if ((childClass === "parent" || childClass === "junction") && (parentClass === "ownerId" || parentClass === "membership")) {
      parents.set(pair.childTable, (parents.get(pair.childTable) ?? new Set<string>()).add(pair.parentTable));
    }
  }
  return parents;
}
