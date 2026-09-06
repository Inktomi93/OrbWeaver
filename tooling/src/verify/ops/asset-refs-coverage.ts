// The asset-refs coverage stage — every FK→`assets.id` column in the LIVE `@orb/db/schema` must be
// classified in `domain/assets/persistence/asset-refs.ts`, the ONE enumeration seam asset GC and the
// portability export both walk. An unregistered column escapes both (a live blob reaped as orphaned; an
// export that ships the referencing row without its bytes).
//
// WHY A DRIZZLE-RUNTIME COMPARATOR AND NOT AN AST GATE (2026-09-05, #1584): the retired
// `asset-refs-fk-coverage` gate re-derived table/column/FK identity from source text — it recognised only
// the `sqliteTable(` calls its own reader could parse, and it saw exactly ONE side of each registry
// (coverage), so a phantom row or a retaining/derived overlap was invisible to it. `getTableConfig` over
// the exported schema module asks the SAME question of the object Drizzle actually runs, so a table reached
// through any authoring shape is in the denominator, and `db-structure` already enforces that every schema
// file is re-exported from the barrel (its header states that invariant).
//
// ONE COMPARATOR, TWO CALLERS — the exact `compareSchemaBaseline`/`runDbBaselineParity` shape in
// ops/db-baseline-parity.ts: this file's CLI (the `structure:asset-refs` stage) and
// tests/server/domain/assets/persistence/asset-refs.int.test.ts both call `compareAssetRefsCoverage`.
// Two comparators would be the drift this stage exists to catch.
//
// A BARE ZERO IS NEVER CLEAN. Zero tables, no `assets` table, or zero asset-FK columns means the reader
// stopped seeing its subject — each is exit 2 (tool error), never a ✓.
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { is } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import type { AssetRefsCoverage, AssetRefsRegistryRow } from "../contract/scoped.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:asset-refs");

const ASSETS_TABLE = "assets";
/** The ONE parent column an asset REFERENCE points at. An FK to any OTHER `assets` column (an
 *  `assets.owner_id` back-reference, say) is a reference to that column's subject, not to the asset's
 *  identity — the GC live-set and the export bundle are both keyed on `AssetId`, so such an FK is OUT OF
 *  SUBJECT rather than an unclassified obligation. Ruled and controlled 2026-09-06: the pre-fix reader
 *  compared only `reference().foreignTable` and would have demanded a registry row for it. If `assets.id`
 *  itself ever disappears, every asset FK vanishes with it and the zero-FK refusal below fires. */
const ASSETS_ID_COLUMN = "id";
const REGISTRY_REL = "packages/server/src/domain/assets/persistence/asset-refs.ts";
/** How many keys to print per verdict group before summarizing — a full schema dump is unreadable. */
const MAX_SHOWN = 20;

const FIX_HINT =
  `classify each column in ${REGISTRY_REL}: RETAINING (a \`{ table, column }\` row in ASSET_REFS — the blob stays live) ` +
  'or DERIVED (its snake-case `"table.column"` key in DERIVED_ASSET_COLUMNS — regenerable, does not pin). ' +
  "A phantom key names no live asset FK and must be deleted; an overlapping key is classified twice and the two lists must be disjoint; a mismatched row pairs a table with another table's column and names nothing coherent.";

/** The comparator's own refusal — a BROKEN reader, routed to exit 2, never a verdict. */
export class AssetRefsCoverageRefusal extends Error {}

export interface AssetRefsCoverageInput {
  /** The `@orb/db/schema` module namespace, read as a Record so any exported table is in the denominator. */
  readonly schema: Readonly<Record<string, unknown>>;
  readonly retaining: readonly AssetRefsRegistryRow[];
  readonly derived: readonly string[];
}

function keyOf(tableName: string, columnName: string): string {
  return `${tableName}.${columnName}`;
}

function sorted(keys: Iterable<string>): readonly string[] {
  return [...new Set(keys)].toSorted();
}

function schemaTables(schema: Readonly<Record<string, unknown>>): readonly SQLiteTable[] {
  return Object.values(schema).filter((value) => is(value, SQLiteTable));
}

/** The table a drizzle column belongs to — the column's OWN identity, never a name someone paired with it. */
function owningTable(column: AnySQLiteColumn): SQLiteTable | null {
  const table: unknown = (column as unknown as { readonly table?: unknown }).table;
  return is(table, SQLiteTable) ? table : null;
}

/** Every FK→`assets.id` column in the live schema, as `table.column` SQL keys. `reference().columns` and
 *  `reference().foreignColumns` are POSITIONALLY PAIRED (child[i] → parent[i]); reading only the parent
 *  TABLE counts an FK to any assets column at all, so the pair is zipped and the parent must be
 *  `assets.id` exactly. */
function assetFkColumns(tables: readonly SQLiteTable[]): readonly string[] {
  const keys: string[] = [];
  for (const table of tables) {
    for (const foreignKey of getTableConfig(table).foreignKeys) {
      const reference = foreignKey.reference();
      if (getTableConfig(reference.foreignTable).name !== ASSETS_TABLE) {
        continue;
      }
      for (const [index, child] of reference.columns.entries()) {
        const parent = reference.foreignColumns[index];
        const owner = owningTable(child);
        if (parent?.name === ASSETS_ID_COLUMN && owner !== null) {
          keys.push(keyOf(getTableConfig(owner).name, child.name));
        }
      }
    }
  }
  return sorted(keys);
}

interface RetainingRead {
  /** Coverage keys, derived from each COLUMN's own owning table. */
  readonly keys: readonly string[];
  /** Rows whose column belongs to a table other than the one they declare. */
  readonly mismatched: readonly string[];
}

/** Read the RETAINING rows. The key comes from the COLUMN's own table, not from the row's declared one: a
 *  row pairing `{ table: characters, column: personas.avatarAssetId }` names a coherent-looking
 *  `characters.avatar_asset_id` under a name-built key, and would then "cover" a column it does not touch
 *  while `personas.avatar_asset_id` reads as covered too. Both halves are reported. */
function retainingKeys(rows: readonly AssetRefsRegistryRow[]): RetainingRead {
  const keys: string[] = [];
  const mismatched: string[] = [];
  for (const [index, row] of rows.entries()) {
    if (!is(row.table, SQLiteTable)) {
      throw new AssetRefsCoverageRefusal(`ASSET_REFS row ${index} does not carry a Drizzle SQLiteTable — the registry reader cannot resolve it`);
    }
    const owner = owningTable(row.column);
    if (owner === null || typeof row.column.name !== "string" || row.column.name.length === 0) {
      throw new AssetRefsCoverageRefusal(`ASSET_REFS row ${index} does not carry a Drizzle column bound to a table — the registry reader cannot resolve it`);
    }
    const declared = getTableConfig(row.table).name;
    const actual = getTableConfig(owner).name;
    if (owner !== row.table) {
      mismatched.push(`${declared}.${row.column.name} (that column belongs to ${actual})`);
    }
    keys.push(keyOf(actual, row.column.name));
  }
  return { keys: sorted(keys), mismatched: sorted(mismatched) };
}

/** The ONE comparison — the CLI stage and the domain int test both call this. Refuses rather than
 *  returning a clean-looking zero when its own subject went missing. */
export function compareAssetRefsCoverage(input: AssetRefsCoverageInput): AssetRefsCoverage {
  const tables = schemaTables(input.schema);
  if (tables.length === 0) {
    throw new AssetRefsCoverageRefusal("the schema module exports ZERO Drizzle SQLiteTables — the reader is blind, so coverage cannot be established");
  }
  if (!tables.some((table) => getTableConfig(table).name === ASSETS_TABLE)) {
    throw new AssetRefsCoverageRefusal(`the schema module exports no \`${ASSETS_TABLE}\` table — there is no FK target to reconcile against`);
  }
  const assetFk = assetFkColumns(tables);
  if (assetFk.length === 0) {
    throw new AssetRefsCoverageRefusal(
      `the schema module declares ZERO foreign keys to \`${ASSETS_TABLE}.id\` — every known asset reference vanished, which is broken evidence rather than a clean verdict`,
    );
  }
  const retainingRead = retainingKeys(input.retaining);
  const retaining = retainingRead.keys;
  const derived = sorted(input.derived);
  const classified = new Set([...retaining, ...derived]);
  const live = new Set(assetFk);
  const derivedSet = new Set(derived);
  return {
    tables: tables.length,
    assetFkColumns: assetFk,
    retaining,
    derived,
    unclassified: assetFk.filter((key) => !classified.has(key)),
    phantom: [...classified].toSorted().filter((key) => !live.has(key)),
    overlap: retaining.filter((key) => derivedSet.has(key)),
    mismatched: retainingRead.mismatched,
  };
}

function printGroup(label: string, keys: readonly string[]): void {
  if (keys.length === 0) {
    return;
  }
  process.stdout.write(`  ✗ ${keys.length} column(s) ${label}:\n`);
  for (const key of keys.slice(0, MAX_SHOWN)) {
    process.stdout.write(`      · ${key}\n`);
  }
  if (keys.length > MAX_SHOWN) {
    process.stdout.write(`      … and ${keys.length - MAX_SHOWN} more\n`);
  }
}

async function loadCoverage(): Promise<AssetRefsCoverage> {
  const schema = await import("@orb/db/schema");
  const { ASSET_REFS, DERIVED_ASSET_COLUMNS } = await import("@orb/server/domain/assets");
  return compareAssetRefsCoverage({
    schema: schema as unknown as Readonly<Record<string, unknown>>,
    retaining: ASSET_REFS,
    derived: DERIVED_ASSET_COLUMNS,
  });
}

/** The `asset-refs` verb. ROOT is accepted for stage-signature symmetry; the reconciliation is over the
 *  RESOLVED modules, which node loads through the workspace exports maps rather than a path walk. */
export async function runAssetRefsCoverage(_root: string): Promise<number> {
  let coverage: AssetRefsCoverage;
  // @orb-gate-ignore caught-failure-ownership(empty:err): printed as TOOL ERROR and routed through EXIT.toolError per the exit-contract — a schema/registry import or reader failure is a BROKEN CHECKER, never a verdict. Ends if that exit code stops being surfaced.
  try {
    coverage = await loadCoverage();
  } catch (err) {
    process.stdout.write(`asset-refs-coverage — TOOL ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
    return EXIT.toolError;
  }
  process.stdout.write(
    `asset-refs-coverage — ${coverage.tables} schema table(s), ${coverage.assetFkColumns.length} asset-FK column(s), ` +
      `${coverage.retaining.length} retaining, ${coverage.derived.length} derived\n`,
  );
  if (coverage.unclassified.length === 0 && coverage.phantom.length === 0 && coverage.overlap.length === 0 && coverage.mismatched.length === 0) {
    process.stdout.write("  ✓ every asset-FK column is classified retaining-or-derived, with no phantom or overlapping row\n");
    return EXIT.clean;
  }
  printGroup("with an FK to `assets.id` registered in NEITHER ASSET_REFS nor DERIVED_ASSET_COLUMNS (GC can reap the blob)", coverage.unclassified);
  printGroup("named by the registry but carrying no FK to `assets.id` (a phantom row)", coverage.phantom);
  printGroup("classified BOTH retaining and derived (the two lists must be disjoint)", coverage.overlap);
  printGroup("named by an ASSET_REFS row whose column belongs to a DIFFERENT table (an incoherent pair)", coverage.mismatched);
  process.stdout.write(`\n  FIX: ${FIX_HINT}\n`);
  return EXIT.violations;
}
