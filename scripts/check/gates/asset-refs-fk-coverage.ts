// Gate: asset-refs-fk-coverage (task #114 — closes the "forgot to register a new asset-bearing
// column" hole `domain/assets/persistence/asset-refs.ts` warns about). `ASSET_REFS`/
// `DERIVED_ASSET_COLUMNS` there is the ONE enumeration seam both asset GC (`collectGarbage`/
// `reapIfOrphan`) AND portability blob-bundling walk — a schema FK→`assets.id` column that isn't
// registered in EITHER list silently escapes both: GC can't see it (a live blob looks orphaned and
// gets reaped) and export/import never bundles its blob. This is the STATIC (`pnpm check:structure`,
// pre-commit) half of the coverage guarantee; `tests/server/domain/assets/persistence/
// asset-refs.int.test.ts` is the equivalent RUNTIME check (drizzle table-config introspection,
// `pnpm test` only) — this gate exists so the same invariant blocks a commit, not just a later run.
//
// SHAPE: walk every `packages/db/src/schema/**/*.ts` `sqliteTable("<sql>", { … })` call; for each
// column property whose initializer chain carries a `.references(() => <assetsImport>.id, …)` — the
// referenced identifier is resolved through its import specifier (module path ending `assets`/
// `assets.ts`) so an ALIASED `assets` import (`import { assets as a } from "./assets"`) is still
// caught, falling back to a literal `assets` identifier match when the import can't be resolved (an
// isolated in-memory fixture with no sibling `assets.ts` module) — collect `{tableJs, tableSql,
// columnJs, columnSql}`. A column is REGISTERED if `<tableJs>.<columnJs>` appears in `ASSET_REFS`
// (the JS-identifier space the registry's `{ table, column }` object literals use) OR
// `<tableSql>.<columnSql>` appears in `DERIVED_ASSET_COLUMNS` (the snake-case string-key space that
// list deliberately uses — see asset-refs.ts's header on why DERIVED counts too: a regenerable
// downstream row like `image_embeddings.asset_id` is a real FK to `assets.id` that must NEVER be
// flagged unregistered, it's consciously classified DERIVED not RETAINING). STRICT — no allowlist,
// no ratchet arm: the correct state is 100% coverage, always.
import type {
  ArrayLiteralExpression,
  CallExpression,
  Expression,
  Identifier,
  ObjectLiteralExpression,
  PropertyAssignment,
  SourceFile,
} from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { Check, CheckContext, Violation } from "../harness.ts";

const SCHEMA_DIR = /\/packages\/db\/src\/schema\//u;
const ASSET_REFS_FILE = /\/packages\/server\/src\/domain\/assets\/persistence\/asset-refs\.ts$/u;
const ASSETS_MODULE_RE = /assets(\.ts)?$/u;
const TABLE_FN = "sqliteTable";
const REFERENCES_METHOD = "references";
const BUILDER_FNS = new Set(["text", "integer", "real", "blob"]);

type FkColumn = {
  readonly tableJs: string;
  readonly tableSql: string;
  readonly columnJs: string;
  readonly columnSql: string;
  readonly line: number;
};

const MESSAGE = (tableSql: string, columnSql: string): string =>
  `column "${tableSql}.${columnSql}" is a foreign key to \`assets.id\` but is registered in NEITHER ` +
  "ASSET_REFS nor DERIVED_ASSET_COLUMNS (domain/assets/persistence/asset-refs.ts) — asset GC and " +
  "portability blob-bundling both enumerate that registry, so an unregistered column silently escapes " +
  "both (a live blob can be reaped as orphaned, and export/import won't bundle it). Classify it " +
  "RETAINING (ASSET_REFS) or DERIVED (DERIVED_ASSET_COLUMNS).";

/** Is `id` a reference to the schema's `assets` table export — resolved via its import specifier
 *  (module path ending `assets`/`assets.ts`, so an aliased import still matches), falling back to a
 *  literal `assets` identifier match when the import can't be resolved (isolated fixture trees). */
function isAssetsTableIdentifier(id: Identifier): boolean {
  const decl = id.getSymbol()?.getDeclarations()[0];
  if (decl !== undefined && decl.isKind(SyntaxKind.ImportSpecifier)) {
    const importedName = decl.getName();
    const moduleSpecifier = decl.getImportDeclaration().getModuleSpecifierValue();
    return importedName === "assets" && ASSETS_MODULE_RE.test(moduleSpecifier);
  }
  return id.getText() === "assets";
}

/** Every `CallExpression` in a column initializer's chain, INCLUDING `init` itself when it is one —
 *  `getDescendantsOfKind` only returns descendants, and a chain's outermost call (typically
 *  `.references(...)`) IS the initializer node, not a descendant of it. */
function callChain(init: Expression): CallExpression[] {
  const descendants = init.getDescendantsOfKind(SyntaxKind.CallExpression);
  return init.isKind(SyntaxKind.CallExpression) ? [init, ...descendants] : descendants;
}

/** Does this column property's initializer chain carry a `.references(() => assets.id, …)` call? */
function referencesAssetsId(prop: PropertyAssignment): boolean {
  const init = prop.getInitializer();
  if (init === undefined) {
    return false;
  }
  for (const call of callChain(init)) {
    const callee = call.getExpression();
    if (
      !(
        callee.isKind(SyntaxKind.PropertyAccessExpression) && callee.getName() === REFERENCES_METHOD
      )
    ) {
      continue;
    }
    const [arrowArg] = call.getArguments();
    if (arrowArg === undefined || !arrowArg.isKind(SyntaxKind.ArrowFunction)) {
      continue;
    }
    const body = arrowArg.getBody();
    if (!body.isKind(SyntaxKind.PropertyAccessExpression) || body.getName() !== "id") {
      continue;
    }
    const obj = body.getExpression();
    if (obj.isKind(SyntaxKind.Identifier) && isAssetsTableIdentifier(obj)) {
      return true;
    }
  }
  return false;
}

/** The SQL column name — the string literal first arg of the innermost drizzle column builder
 *  (`text("avatar_asset_id")…`) in this initializer's call chain. Every asset-FK column in this
 *  schema is `text(...)`, but `integer`/`real`/`blob` are matched too for robustness. */
function findColumnSqlName(init: Expression): string {
  for (const call of callChain(init)) {
    const callee = call.getExpression();
    if (callee.isKind(SyntaxKind.Identifier) && BUILDER_FNS.has(callee.getText())) {
      const [arg0] = call.getArguments();
      if (arg0 !== undefined && arg0.isKind(SyntaxKind.StringLiteral)) {
        return arg0.getLiteralText();
      }
    }
  }
  return "";
}

/** Every asset-FK column declared on ONE `sqliteTable(tableSql, { … })` object literal. */
function fkColumnsOfTable(
  tableJs: string,
  tableSql: string,
  colsArg: ObjectLiteralExpression,
): FkColumn[] {
  const out: FkColumn[] = [];
  for (const prop of colsArg.getProperties()) {
    if (!(prop.isKind(SyntaxKind.PropertyAssignment) && referencesAssetsId(prop))) {
      continue;
    }
    out.push({
      tableJs,
      tableSql,
      columnJs: prop.getName(),
      columnSql: findColumnSqlName(prop.getInitializerOrThrow()),
      line: prop.getStartLineNumber(),
    });
  }
  return out;
}

/** Every column in this schema file whose FK targets `assets.id`. */
function fkColumnsToAssets(sf: SourceFile): FkColumn[] {
  const out: FkColumn[] = [];
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (!(callee.isKind(SyntaxKind.Identifier) && callee.getText() === TABLE_FN)) {
      continue;
    }
    const [nameArg, colsArg] = call.getArguments();
    if (nameArg === undefined || !nameArg.isKind(SyntaxKind.StringLiteral)) {
      continue;
    }
    if (colsArg === undefined || !colsArg.isKind(SyntaxKind.ObjectLiteralExpression)) {
      continue;
    }
    const tableJs = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName();
    if (tableJs === undefined) {
      continue;
    }
    out.push(...fkColumnsOfTable(tableJs, nameArg.getLiteralText(), colsArg));
  }
  return out;
}

/** A `{ table: …, column: … }` element's two `PropertyAssignment`s, or `undefined` if either is
 *  missing / a non-property shape (spread, shorthand, computed). */
function tableAndColumnProps(
  el: Expression,
): { tableProp: PropertyAssignment; columnProp: PropertyAssignment } | undefined {
  if (!el.isKind(SyntaxKind.ObjectLiteralExpression)) {
    return;
  }
  const tableProp = el.getProperty("table");
  const columnProp = el.getProperty("column");
  if (
    tableProp === undefined ||
    columnProp === undefined ||
    !tableProp.isKind(SyntaxKind.PropertyAssignment) ||
    !columnProp.isKind(SyntaxKind.PropertyAssignment)
  ) {
    return;
  }
  return { tableProp, columnProp };
}

/** One `ASSET_REFS` element (`{ table: X, column: X.Y }`) as its `X.Y` JS-identifier-space key, or
 *  `undefined` for a shape the gate can't statically resolve. */
function retainingKeyOf(el: Expression): string | undefined {
  const props = tableAndColumnProps(el);
  if (props === undefined) {
    return;
  }
  const tableInit = props.tableProp.getInitializer();
  const columnInit = props.columnProp.getInitializer();
  if (tableInit === undefined || !tableInit.isKind(SyntaxKind.Identifier)) {
    return;
  }
  if (columnInit === undefined || !columnInit.isKind(SyntaxKind.PropertyAccessExpression)) {
    return;
  }
  return `${tableInit.getText()}.${columnInit.getName()}`;
}

/** The array literal initializer of `export const <exactName> = [...]` at the top level of `sf`, if
 *  present (a re-declared or differently-shaped export makes this a graceful `undefined`). */
function namedArrayLiteral(sf: SourceFile, exactName: string): ArrayLiteralExpression | undefined {
  const decl = sf.getVariableDeclarations().find((d) => d.getName() === exactName);
  const init = decl?.getInitializer();
  return init?.isKind(SyntaxKind.ArrayLiteralExpression) ? init : undefined;
}

/** `ASSET_REFS` elements as `X.Y` JS-identifier-space keys (RETAINING references). */
function collectRetaining(sf: SourceFile): Set<string> {
  const retaining = new Set<string>();
  for (const el of namedArrayLiteral(sf, "ASSET_REFS")?.getElements() ?? []) {
    const key = retainingKeyOf(el);
    if (key !== undefined) {
      retaining.add(key);
    }
  }
  return retaining;
}

/** `DERIVED_ASSET_COLUMNS` elements as snake-case `"table.column"` string keys. */
function collectDerived(sf: SourceFile): Set<string> {
  const derived = new Set<string>();
  for (const el of namedArrayLiteral(sf, "DERIVED_ASSET_COLUMNS")?.getElements() ?? []) {
    if (el.isKind(SyntaxKind.StringLiteral)) {
      derived.add(el.getLiteralText());
    }
  }
  return derived;
}

/** Parses `asset-refs.ts`'s two registry arrays: `ASSET_REFS` (`{ table: X, column: X.Y }` object
 *  literals, keyed here in JS-identifier space `X.Y`) and `DERIVED_ASSET_COLUMNS` (snake-case
 *  `"table.column"` string literals, kept as-is). */
function parseRegistry(sf: SourceFile): { retaining: Set<string>; derived: Set<string> } {
  return { retaining: collectRetaining(sf), derived: collectDerived(sf) };
}

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

/** Groups `project`'s source files into the registry file (if loaded) + every schema file. */
function partitionProject(project: CheckContext["project"]): {
  registrySf: SourceFile | undefined;
  schemaFiles: SourceFile[];
} {
  let registrySf: SourceFile | undefined;
  const schemaFiles: SourceFile[] = [];
  for (const sf of project.getSourceFiles()) {
    const path = sf.getFilePath();
    if (ASSET_REFS_FILE.test(path)) {
      registrySf = sf;
    } else if (SCHEMA_DIR.test(path)) {
      schemaFiles.push(sf);
    }
  }
  return { registrySf, schemaFiles };
}

/** The Check: every schema FK→`assets.id` column must be classified in ASSET_REFS (JS-identifier
 *  space) or DERIVED_ASSET_COLUMNS (snake-case space) — vacuous when the registry file isn't in the
 *  project (a schema-only fixture with nothing to check against). */
export const assetRefsFkCoverage: Check = {
  name: "asset-refs-fk-coverage",
  run: ({ root, project }: CheckContext): Violation[] => {
    const { registrySf, schemaFiles } = partitionProject(project);
    if (registrySf === undefined) {
      return [];
    }
    const { retaining, derived } = parseRegistry(registrySf);
    const violations: Violation[] = [];
    for (const sf of schemaFiles) {
      for (const col of fkColumnsToAssets(sf)) {
        const jsKey = `${col.tableJs}.${col.columnJs}`;
        const sqlKey = `${col.tableSql}.${col.columnSql}`;
        if (retaining.has(jsKey) || derived.has(sqlKey)) {
          continue;
        }
        violations.push({
          file: relPath(root, sf.getFilePath()),
          line: col.line,
          message: MESSAGE(col.tableSql, col.columnSql),
        });
      }
    }
    return violations;
  },
};

// ── SINGLE-PASS CONTRACT FORM (§1.2, §8.1 (c) — a whole-project reconciliation via `run`) ───────────
// asset-refs-fk-coverage reconciles every schema FK→`assets.id` column against the two registry arrays
// in domain/assets/persistence/asset-refs.ts. Pure-AST (no fs — it reads the registry + schema through
// the shared Project, symbol-resolving aliased `assets` imports via the checker), so NOT fsBacked. STRICT
// — no allowlist, no ratchet arm — so it ports as a `run` reusing the exact scan (vacuous when the
// registry file isn't loaded, exactly like the legacy). Distinct per-column messages → per-occurrence
// overrides. Byte-identical to the legacy Check. Kept ALONGSIDE the legacy.
export const gate: GateDescriptor = {
  name: "asset-refs-fk-coverage",
  docRow: "domain/assets/persistence/asset-refs.ts (task #114)",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "a schema column is a foreign key to `assets.id` but is registered in NEITHER ASSET_REFS nor DERIVED_ASSET_COLUMNS (domain/assets/persistence/asset-refs.ts) — asset GC and portability blob-bundling both enumerate that registry, so an unregistered column silently escapes both.",
  fix: 'classify the column RETAINING (add a `{ table, column }` row to ASSET_REFS) or DERIVED (add its snake-case `"table.column"` to DERIVED_ASSET_COLUMNS) in domain/assets/persistence/asset-refs.ts.',
  run: (ctx) => {
    const { registrySf, schemaFiles } = partitionProject(ctx.project);
    if (registrySf === undefined) {
      return;
    }
    const { retaining, derived } = parseRegistry(registrySf);
    for (const sf of schemaFiles) {
      for (const col of fkColumnsToAssets(sf)) {
        const jsKey = `${col.tableJs}.${col.columnJs}`;
        const sqlKey = `${col.tableSql}.${col.columnSql}`;
        if (retaining.has(jsKey) || derived.has(sqlKey)) {
          continue;
        }
        ctx.report({
          file: relPath(ctx.root, sf.getFilePath()),
          line: col.line,
          column: 0,
          message: MESSAGE(col.tableSql, col.columnSql),
        });
      }
    }
  },
  mustFlag: [
    {
      files: {
        "packages/db/src/schema/x.ts":
          'import { assets } from "./assets";\nexport const t = sqliteTable("thing", {\n  assetId: text("asset_id").references(() => assets.id),\n});\n',
        "packages/db/src/schema/assets.ts":
          'export const assets = sqliteTable("assets", { id: text("id").primaryKey() });\n',
        "packages/server/src/domain/assets/persistence/asset-refs.ts":
          "export const ASSET_REFS = [];\nexport const DERIVED_ASSET_COLUMNS = [];\n",
      },
      expect: { messageIncludes: "registered in NEITHER" },
      why: "a schema FK→assets.id column absent from both registry arrays — GC/portability would miss it",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/db/src/schema/x.ts":
          'import { assets } from "./assets";\nexport const t = sqliteTable("thing", {\n  assetId: text("asset_id").references(() => assets.id),\n});\n',
        "packages/db/src/schema/assets.ts":
          'export const assets = sqliteTable("assets", { id: text("id").primaryKey() });\n',
        "packages/server/src/domain/assets/persistence/asset-refs.ts":
          "export const ASSET_REFS = [{ table: t, column: t.assetId }];\nexport const DERIVED_ASSET_COLUMNS: string[] = [];\n",
      },
      why: "the FK column is classified RETAINING in ASSET_REFS — a covered column, passes",
    },
    {
      // classified DERIVED (the image_embeddings precedent) via its snake-case "table.column" key.
      files: {
        "packages/db/src/schema/x.ts":
          'import { assets } from "./assets";\nexport const t = sqliteTable("thing", {\n  assetId: text("asset_id").references(() => assets.id),\n});\n',
        "packages/db/src/schema/assets.ts":
          'export const assets = sqliteTable("assets", { id: text("id").primaryKey() });\n',
        "packages/server/src/domain/assets/persistence/asset-refs.ts":
          'export const ASSET_REFS = [];\nexport const DERIVED_ASSET_COLUMNS = ["thing.asset_id"];\n',
      },
      why: "the FK column is classified DERIVED in DERIVED_ASSET_COLUMNS (the image_embeddings precedent) — passes",
    },
    {
      // vacuous when the registry file isn't loaded (a schema-only fixture with nothing to check against).
      files: {
        "packages/db/src/schema/x.ts":
          'import { assets } from "./assets";\nexport const t = sqliteTable("thing", {\n  assetId: text("asset_id").references(() => assets.id),\n});\n',
        "packages/db/src/schema/assets.ts":
          'export const assets = sqliteTable("assets", { id: text("id").primaryKey() });\n',
      },
      why: "vacuous: the asset-refs registry file isn't in the project — nothing to reconcile against, passes",
    },
    {
      // a schema column with no FK to assets.id is not an asset ref — ignored.
      files: {
        "packages/db/src/schema/x.ts":
          'export const t = sqliteTable("thing", { id: text("id").primaryKey() });\n',
        "packages/server/src/domain/assets/persistence/asset-refs.ts":
          "export const ASSET_REFS = [];\nexport const DERIVED_ASSET_COLUMNS: string[] = [];\n",
      },
      why: "a schema column with no FK to assets.id is not an asset ref — ignored, passes",
    },
  ],
};
