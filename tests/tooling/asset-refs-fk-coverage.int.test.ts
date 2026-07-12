// Self-test for `scripts/check/gates/asset-refs-fk-coverage.ts` (task #114). Drives the Check
// directly over in-memory ts-morph projects (never the real tree): a schema FK→`assets.id` column
// registered in ASSET_REFS passes; one registered only in DERIVED_ASSET_COLUMNS also passes (the
// image_embeddings precedent); an unregistered FK column fires; and the gate is vacuous when the
// registry file isn't loaded (a schema-only fixture with nothing to check against).
import { assetRefsFkCoverage } from "../../scripts/check/gates/asset-refs-fk-coverage.ts";
import { expect, test } from "../support/fixtures.ts";
import { ctxFor } from "./_support.ts";

const SCHEMA_ASSETS = "packages/db/src/schema/assets.ts";
const SCHEMA_THING = "packages/db/src/schema/thing.ts";
const REGISTRY = "packages/server/src/domain/assets/persistence/asset-refs.ts";

const ASSETS_TABLE =
  'export const assets = sqliteTable("assets", { id: text("id").primaryKey() });\n';

/** A schema module declaring `things` with one asset-FK column. */
const THING_SCHEMA =
  'import { assets } from "./assets";\n' +
  'export const things = sqliteTable("things", {\n' +
  '  id: text("id").primaryKey(),\n' +
  '  avatarAssetId: text("avatar_asset_id").references(() => assets.id, { onDelete: "set null" }),\n' +
  "});\n";

test("fires on a schema FK-to-assets.id column registered in NEITHER list", () => {
  const registry = "export const ASSET_REFS = [];\nexport const DERIVED_ASSET_COLUMNS = [];\n";
  const v = assetRefsFkCoverage.run(
    ctxFor({
      [SCHEMA_ASSETS]: ASSETS_TABLE,
      [SCHEMA_THING]: THING_SCHEMA,
      [REGISTRY]: registry,
    }),
  );
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("things.avatar_asset_id");
});

test("passes a column registered RETAINING in ASSET_REFS", () => {
  const registry =
    "export const ASSET_REFS = [{ table: things, column: things.avatarAssetId }];\n" +
    "export const DERIVED_ASSET_COLUMNS = [];\n";
  const v = assetRefsFkCoverage.run(
    ctxFor({
      [SCHEMA_ASSETS]: ASSETS_TABLE,
      [SCHEMA_THING]: THING_SCHEMA,
      [REGISTRY]: registry,
    }),
  );
  expect(v).toEqual([]);
});

test("passes a column registered DERIVED in DERIVED_ASSET_COLUMNS (the image_embeddings precedent)", () => {
  const registry =
    "export const ASSET_REFS = [];\n" +
    'export const DERIVED_ASSET_COLUMNS = ["things.avatar_asset_id"];\n';
  const v = assetRefsFkCoverage.run(
    ctxFor({
      [SCHEMA_ASSETS]: ASSETS_TABLE,
      [SCHEMA_THING]: THING_SCHEMA,
      [REGISTRY]: registry,
    }),
  );
  expect(v).toEqual([]);
});

test("vacuous when the asset-refs registry file isn't in the project", () => {
  const v = assetRefsFkCoverage.run(
    ctxFor({ [SCHEMA_ASSETS]: ASSETS_TABLE, [SCHEMA_THING]: THING_SCHEMA }),
  );
  expect(v).toEqual([]);
});

test("ignores a schema column with no FK to assets.id", () => {
  const registry = "export const ASSET_REFS = [];\nexport const DERIVED_ASSET_COLUMNS = [];\n";
  const noFkSchema =
    'export const things = sqliteTable("things", { id: text("id").primaryKey() });\n';
  const v = assetRefsFkCoverage.run(
    ctxFor({
      [SCHEMA_ASSETS]: ASSETS_TABLE,
      [SCHEMA_THING]: noFkSchema,
      [REGISTRY]: registry,
    }),
  );
  expect(v).toEqual([]);
});
