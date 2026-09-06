// persistence: asset-refs — the DOMAIN half of the STRUCTURAL close of the silent-GC gap. Every column in
// the live `@orb/db` schema whose FK target is `assets.id` must be classified in the registry: RETAINING
// (`ASSET_REFS`, keeps the blob) or DERIVED (`DERIVED_ASSET_COLUMNS`, regenerable, does not pin). A new
// asset-bearing column in NEITHER list means GC can silently reclaim a live blob and the portability export
// will not bundle it (assets-maintenance.md §"the asset-ref registry").
//
// THE COMPARATOR LIVES IN THE STAGE, NOT HERE (2026-09-05, #1584 — the same move `db-baseline-parity` made):
// `compareAssetRefsCoverage` (tooling/src/verify/ops/asset-refs-coverage.ts) owns the ONE reconciliation, and
// the `structure:asset-refs` stage in `pnpm check` is its other caller, so the coverage/phantom/overlap
// verdict is RED at commit time rather than only in this push-tier suite. Two reconciliations would be
// exactly the drift this pins against — so this file asserts through the shared comparator, and keeps only
// the DOMAIN-specific rows (which columns are known-retaining; that `image_embeddings` stays derived) as its
// own assertions, because those are ledger decisions about THIS registry, not a general structural rule.

// biome-ignore lint/performance/noNamespaceImport: the comparator's denominator IS every table the schema module exports — a namespace import is the canonical way to enumerate them (the schema-baseline-parity test does the same).
import * as schema from "@orb/db/schema";
import { ASSET_REFS, DERIVED_ASSET_COLUMNS } from "@orb/server/domain/assets";
import { compareAssetRefsCoverage } from "@orb/tooling/verify";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { expect, test } from "../../../../support/fixtures.ts";

/** The load-bearing DERIVED exclusion: if `image_embeddings.asset_id` counted as retaining, every image
 *  asset would be permanently live and `reapIfOrphan`/`collectGarbage` would reclaim nothing. */
const DERIVED_EXCLUSION = "image_embeddings.asset_id";

/** The known live RETAINING references. A demotion of any of these to DERIVED (or a drop) re-opens the reap
 *  the row closed — `plugin_assets.asset_id` (#802) most of all: it is the ONLY thing referencing a
 *  plugin-fetched cover, so nothing else would notice. */
const KNOWN_RETAINING: readonly string[] = [
  "characters.avatar_asset_id",
  "personas.avatar_asset_id",
  "gallery_items.asset_id",
  "documents.source_asset_id",
  "imagery_generations.asset_id",
  "plugins.bundle_asset_id",
  "plugin_assets.asset_id",
];

function coverage(): ReturnType<typeof compareAssetRefsCoverage> {
  return compareAssetRefsCoverage({
    schema: schema as unknown as Readonly<Record<string, unknown>>,
    retaining: ASSET_REFS,
    derived: DERIVED_ASSET_COLUMNS,
  });
}

test("every asset-FK column in @orb/db is classified retaining-or-derived, with no phantom or overlapping row", () => {
  const result = coverage();

  // Named separately: an unclassified column is the silent-GC gap, a phantom row names nothing at all, and
  // an overlapping key is classified twice — three different repairs in asset-refs.ts.
  expect(result.unclassified).toEqual([]);
  expect(result.phantom).toEqual([]);
  expect(result.overlap).toEqual([]);
  // The denominator, asserted last: with the three lists empty this can only fail on a blind read, and the
  // comparator's own refusals already cover a total collapse.
  expect(result.assetFkColumns.length).toBe(result.retaining.length + result.derived.length);
});

test("image_embeddings.asset_id stays DERIVED (the load-bearing exclusion)", () => {
  const result = coverage();

  expect(result.derived).toContain(DERIVED_EXCLUSION);
  expect(result.retaining).not.toContain(DERIVED_EXCLUSION);
});

test("the known live references are RETAINING (avatar, gallery, doc source, imagery, plugin bundle, plugin asset)", () => {
  const retaining = new Set(coverage().retaining);

  for (const key of KNOWN_RETAINING) {
    expect(retaining.has(key), `${key} must stay RETAINING`).toBe(true);
  }
});

test("every ASSET_REFS row resolves to a live schema table — a row naming a dropped table is not silently skipped", () => {
  const named = ASSET_REFS.map((ref) => `${getTableConfig(ref.table).name}.${ref.column.name}`);

  expect(named.length).toBe(ASSET_REFS.length);
  expect(new Set(named).size).toBe(named.length);
});
