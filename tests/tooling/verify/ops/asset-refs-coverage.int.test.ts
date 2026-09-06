// The `structure:asset-refs` stage's comparator, proven on PLANTED in-memory Drizzle schemas (built here
// with `sqliteTable`/`text`/`references`, so each verdict and each refusal has its own minimal subject) and
// then exercised against the LIVE tree.
//
// WHY THE PLANTED HALF EXISTS AT ALL: the live run can only ever prove the CLEAN arm — the tree is expected
// to be classified — so unclassified/phantom/overlap and every refusal would otherwise be unmeasured
// behavior. And the refusals are the half that matters most: this comparator replaced an AST gate whose
// blind spot was a silently shrinking denominator, so a zero-table / no-`assets` / zero-FK read must be a
// TOOL ERROR here rather than a ✓.
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { AssetRefsCoverageRefusal, compareAssetRefsCoverage, runAssetRefsCoverage } from "../../../../tooling/src/verify/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const assets = sqliteTable("assets", { id: text("id").primaryKey(), ownerId: text("owner_id") });
const characters = sqliteTable("characters", {
  id: text("id").primaryKey(),
  avatarAssetId: text("avatar_asset_id").references(() => assets.id),
});
const imageEmbeddings = sqliteTable("image_embeddings", {
  id: text("id").primaryKey(),
  assetId: text("asset_id").references(() => assets.id),
});
const chats = sqliteTable("chats", { id: text("id").primaryKey() });
/** THE SAME-SPELLING COUNTERFACTUAL for both identity claims: a table with an identically NAMED
 *  `avatar_asset_id` column (so a name-built registry key cannot tell it from `characters`'), plus an FK
 *  aimed at a NON-`id` assets column (so a parent-TABLE-only reader cannot tell it from an asset ref). */
const personas = sqliteTable("personas", {
  id: text("id").primaryKey(),
  avatarAssetId: text("avatar_asset_id").references(() => assets.id),
  uploaderId: text("uploader_id").references(() => assets.ownerId),
});

const FULL_SCHEMA = { assets, characters, imageEmbeddings, chats, notATable: "just a string" };
const RETAINING = [{ table: characters, column: characters.avatarAssetId }];
const DERIVED = ["image_embeddings.asset_id"];
/** The schema WITH the counterfactual table; kept separate so the ordinary rows above stay minimal. */
const SCHEMA_WITH_PERSONAS = { ...FULL_SCHEMA, personas };

/** The live tree's floor: the registry classifies at least the nine long-standing asset-FK columns. */
const LIVE_ASSET_FK_FLOOR = 9;
/** `runAssetRefsCoverage` loads `@orb/db/schema` + the assets front door — a cold module graph. */
const LIVE_RUN_BUDGET_MS = 60_000;
const EXIT_CLEAN = 0;

test("a fully classified schema is clean, and the receipt names its denominator", () => {
  const coverage = compareAssetRefsCoverage({ schema: FULL_SCHEMA, retaining: RETAINING, derived: DERIVED });

  expect(coverage.assetFkColumns).toEqual(["characters.avatar_asset_id", "image_embeddings.asset_id"]);
  expect(coverage.tables).toBe(4);
  expect({ unclassified: coverage.unclassified, phantom: coverage.phantom, overlap: coverage.overlap, mismatched: coverage.mismatched }).toEqual({
    unclassified: [],
    phantom: [],
    overlap: [],
    mismatched: [],
  });
});

// ── the two IDENTITY counterfactuals: same SPELLING, different IDENTITY ───────────────────────────────
// Each is red-first against the pre-fix reader, which compared the FK's parent TABLE only and built the
// registry key from the row's DECLARED table name.

test("an FK to a NON-`id` assets column is OUT OF SUBJECT — not an asset reference, not an obligation", () => {
  const coverage = compareAssetRefsCoverage({
    schema: SCHEMA_WITH_PERSONAS,
    retaining: [...RETAINING, { table: personas, column: personas.avatarAssetId }],
    derived: DERIVED,
  });

  // `personas.uploader_id` points at `assets.owner_id`: a reference to the OWNER, not to the asset's
  // identity. The GC live-set and the export bundle are keyed on AssetId, so it owes no registry row.
  // A parent-TABLE-only reader counted it and would have demanded one.
  expect(coverage.assetFkColumns).not.toContain("personas.uploader_id");
  expect(coverage.assetFkColumns).toEqual(["characters.avatar_asset_id", "image_embeddings.asset_id", "personas.avatar_asset_id"]);
  expect(coverage.unclassified).toEqual([]);
});

test("a registry row pairing one table with ANOTHER table's same-named column is a mismatch, and covers neither", () => {
  const coverage = compareAssetRefsCoverage({
    schema: SCHEMA_WITH_PERSONAS,
    // The row DECLARES `characters` but carries `personas.avatarAssetId`. Both columns are spelled
    // `avatar_asset_id`, so a key built from the declared table name reads as coverage of `characters`
    // AND silently leaves `personas` uncovered — one row appearing to satisfy two different obligations.
    retaining: [{ table: characters, column: personas.avatarAssetId }],
    derived: DERIVED,
  });

  expect(coverage.mismatched).toEqual(["characters.avatar_asset_id (that column belongs to personas)"]);
  // The key resolves to the column's OWN table, so `characters.avatar_asset_id` is exposed as uncovered
  // rather than absorbed by the incoherent row.
  expect(coverage.unclassified).toEqual(["characters.avatar_asset_id"]);
  expect(coverage.retaining).toEqual(["personas.avatar_asset_id"]);
});

test("an asset-FK column in NEITHER list is unclassified — the silent-GC gap the stage exists to close", () => {
  const coverage = compareAssetRefsCoverage({ schema: FULL_SCHEMA, retaining: [], derived: DERIVED });

  expect(coverage.unclassified).toEqual(["characters.avatar_asset_id"]);
  expect(coverage.phantom).toEqual([]);
});

test("a registry key naming no live asset FK is a phantom row — the direction the retired AST gate could not see", () => {
  const coverage = compareAssetRefsCoverage({
    schema: FULL_SCHEMA,
    retaining: RETAINING,
    derived: [...DERIVED, "image_index_skips.asset_id"],
  });

  expect(coverage.phantom).toEqual(["image_index_skips.asset_id"]);
  expect(coverage.unclassified).toEqual([]);
});

test("a key classified BOTH retaining and derived is an overlap — the two lists must be disjoint", () => {
  const coverage = compareAssetRefsCoverage({
    schema: FULL_SCHEMA,
    retaining: [...RETAINING, { table: imageEmbeddings, column: imageEmbeddings.assetId }],
    derived: DERIVED,
  });

  expect(coverage.overlap).toEqual(["image_embeddings.asset_id"]);
});

test("a schema module with no Drizzle tables REFUSES — a blind reader is never a clean verdict", () => {
  expect(() => compareAssetRefsCoverage({ schema: { nope: 1 }, retaining: [], derived: [] })).toThrow(AssetRefsCoverageRefusal);
  expect(() => compareAssetRefsCoverage({ schema: { nope: 1 }, retaining: [], derived: [] })).toThrow(/ZERO Drizzle SQLiteTables/u);
});

test("a schema module with no `assets` table REFUSES — there is no FK target to reconcile against", () => {
  expect(() => compareAssetRefsCoverage({ schema: { chats }, retaining: [], derived: [] })).toThrow(/no `assets` table/u);
});

test("a schema module whose asset FKs all vanished REFUSES — broken evidence, not a clean sweep", () => {
  expect(() => compareAssetRefsCoverage({ schema: { assets, chats }, retaining: [], derived: [] })).toThrow(/ZERO foreign keys/u);
});

test("a registry row that is not a resolved Drizzle table/column REFUSES rather than reading as absent", () => {
  const notATable = { table: { name: "characters" }, column: { name: "avatar_asset_id" } } as unknown as (typeof RETAINING)[number];

  expect(() => compareAssetRefsCoverage({ schema: FULL_SCHEMA, retaining: [notATable], derived: DERIVED })).toThrow(/does not carry a Drizzle SQLiteTable/u);
});

test(
  "the LIVE @orb/db schema + assets registry reconcile clean, over a real asset-FK population",
  async ({ repoRoot }) => {
    expect(await runAssetRefsCoverage(repoRoot)).toBe(EXIT_CLEAN);

    // The command prints its verdict; assert the population it judged directly so a green here can never be
    // a green over an empty denominator.
    const schema = await import("@orb/db/schema");
    const { ASSET_REFS, DERIVED_ASSET_COLUMNS } = await import("@orb/server/domain/assets");
    const coverage = compareAssetRefsCoverage({
      schema: schema as unknown as Readonly<Record<string, unknown>>,
      retaining: ASSET_REFS,
      derived: DERIVED_ASSET_COLUMNS,
    });

    expect(coverage.assetFkColumns.length).toBeGreaterThanOrEqual(LIVE_ASSET_FK_FLOOR);
    expect({ unclassified: coverage.unclassified, phantom: coverage.phantom, overlap: coverage.overlap, mismatched: coverage.mismatched }).toEqual({
      unclassified: [],
      phantom: [],
      overlap: [],
      mismatched: [],
    });
  },
  LIVE_RUN_BUDGET_MS,
);
