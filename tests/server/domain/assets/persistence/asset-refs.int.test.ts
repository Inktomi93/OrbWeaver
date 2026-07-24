// persistence: asset-refs — the STRUCTURAL close of the silent-GC gap. Enumerates EVERY column in the live
// `@orb/db` schema whose FK target is `assets.id`, and asserts each is classified in the registry — either
// RETAINING (`ASSET_REFS`, keeps the blob) or DERIVED (`DERIVED_ASSET_COLUMNS`, regenerable, does not pin).
// A new asset-bearing column that is in NEITHER list fails here — so GC can never silently reclaim a live
// blob because someone forgot to register a new reference. This is the coverage guarantee the maintenance
// wave rests on (assets-maintenance.md §"the asset-ref registry"; the tag `persistence/junctions` twin).
//
// It also asserts the two lists are DISJOINT (a column can't be both) and that `image_embeddings.assetId`
// specifically stays DERIVED — the load-bearing exclusion (if it counted as retaining, every image asset
// would be permanently live and `reapIfOrphan`/`collectGarbage` would reclaim nothing).

// biome-ignore lint/performance/noNamespaceImport: drizzle introspection walks the WHOLE schema module as a Record — namespace import is the canonical way to enumerate every table (the schema-baseline-parity test does the same).
import * as schema from "@orb/db";
import { is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import { ASSET_REFS, DERIVED_ASSET_COLUMNS } from "../../../../../packages/server/src/domain/assets/persistence/asset-refs.ts";
import { expect, test } from "../../../../support/fixtures";

/** `table.column` key for a registry entry or a schema FK. */
function keyOf(tableName: string, columnName: string): string {
  return `${tableName}.${columnName}`;
}

/** Every FK-to-`assets.id` column in the live schema, as `table.column` snake-case keys (the drizzle SQL
 *  names, matching what the registry columns expose via `.name`). */
function schemaAssetFkColumns(): Set<string> {
  const keys = new Set<string>();
  for (const value of Object.values(schema)) {
    if (!is(value, SQLiteTable)) {
      continue;
    }
    const cfg = getTableConfig(value);
    for (const fk of cfg.foreignKeys) {
      const ref = fk.reference();
      const targetTable = getTableConfig(ref.foreignTable).name;
      if (targetTable !== "assets") {
        continue;
      }
      for (const col of ref.columns) {
        keys.add(keyOf(cfg.name, col.name));
      }
    }
  }
  return keys;
}

function registryKeys(refs: readonly { table: SQLiteTable; column: { name: string } }[]): Set<string> {
  return new Set(refs.map((r) => keyOf(getTableConfig(r.table).name, r.column.name)));
}

test("every asset-FK column in @orb/db is classified retaining-or-derived (no silent GC gap)", () => {
  const schemaColumns = schemaAssetFkColumns();
  const retaining = registryKeys(ASSET_REFS);
  const derived = new Set(DERIVED_ASSET_COLUMNS);
  const classified = new Set([...retaining, ...derived]);

  // 1. Total coverage: every FK-to-assets column is classified (the silent-GC-gap closer).
  const unclassified = [...schemaColumns].filter((c) => !classified.has(c)).sort();
  expect(unclassified).toEqual([]);

  // 2. No phantom entries: the registry never names a column that isn't actually an asset FK.
  const phantom = [...classified].filter((c) => !schemaColumns.has(c)).sort();
  expect(phantom).toEqual([]);
});

test("retaining and derived lists are disjoint", () => {
  const retaining = registryKeys(ASSET_REFS);
  const derived = new Set(DERIVED_ASSET_COLUMNS);
  const both = [...retaining].filter((c) => derived.has(c));
  expect(both).toEqual([]);
});

test("image_embeddings.asset_id stays DERIVED (the load-bearing exclusion)", () => {
  const derived = new Set(DERIVED_ASSET_COLUMNS);
  const retaining = registryKeys(ASSET_REFS);
  expect(derived.has("image_embeddings.asset_id")).toBe(true);
  expect(retaining.has("image_embeddings.asset_id")).toBe(false);
});

test("the known live references are RETAINING (avatar, gallery, doc source, imagery, plugin bundle)", () => {
  const retaining = registryKeys(ASSET_REFS);
  for (const key of [
    "characters.avatar_asset_id",
    "personas.avatar_asset_id",
    "gallery_items.asset_id",
    "documents.source_asset_id",
    "imagery_generations.asset_id",
    "plugins.bundle_asset_id",
  ]) {
    expect(retaining.has(key)).toBe(true);
  }
});
