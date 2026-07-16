// Gate: asset-refs-fk-coverage — every schema FK→`assets.id` column must be registered in
// `ASSET_REFS` or `DERIVED_ASSET_COLUMNS` (domain/assets/persistence/asset-refs.ts), the one
// enumeration seam both asset GC and portability blob-bundling walk. Unregistered = invisible to
// both (GC can reap a live blob as orphaned; export/import won't bundle it). STRICT, no allowlist.
import type { ArrayLiteralExpression, CallExpression, Expression, Identifier, ObjectLiteralExpression, PropertyAssignment, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { CheckContext } from "../harness.ts";

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

function isAssetsTableIdentifier(id: Identifier): boolean {
  const decl = id.getSymbol()?.getDeclarations()[0];
  if (decl?.isKind(SyntaxKind.ImportSpecifier)) {
    const importedName = decl.getName();
    const moduleSpecifier = decl.getImportDeclaration().getModuleSpecifierValue();
    return importedName === "assets" && ASSETS_MODULE_RE.test(moduleSpecifier);
  }
  return id.getText() === "assets";
}

// Includes `init` itself if it's a CallExpression — getDescendantsOfKind only returns descendants.
function callChain(init: Expression): CallExpression[] {
  const descendants = init.getDescendantsOfKind(SyntaxKind.CallExpression);
  return init.isKind(SyntaxKind.CallExpression) ? [init, ...descendants] : descendants;
}

function referencesAssetsId(prop: PropertyAssignment): boolean {
  const init = prop.getInitializer();
  if (init === undefined) {
    return false;
  }
  for (const call of callChain(init)) {
    const callee = call.getExpression();
    if (!(callee.isKind(SyntaxKind.PropertyAccessExpression) && callee.getName() === REFERENCES_METHOD)) {
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

function findColumnSqlName(init: Expression): string {
  for (const call of callChain(init)) {
    const callee = call.getExpression();
    if (callee.isKind(SyntaxKind.Identifier) && BUILDER_FNS.has(callee.getText())) {
      const [arg0] = call.getArguments();
      if (arg0?.isKind(SyntaxKind.StringLiteral)) {
        return arg0.getLiteralText();
      }
    }
  }
  return "";
}

function fkColumnsOfTable(tableJs: string, tableSql: string, colsArg: ObjectLiteralExpression): FkColumn[] {
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

function tableAndColumnProps(el: Expression): { tableProp: PropertyAssignment; columnProp: PropertyAssignment } | undefined {
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

function namedArrayLiteral(sf: SourceFile, exactName: string): ArrayLiteralExpression | undefined {
  const decl = sf.getVariableDeclarations().find((d) => d.getName() === exactName);
  const init = decl?.getInitializer();
  return init?.isKind(SyntaxKind.ArrayLiteralExpression) ? init : undefined;
}

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

function collectDerived(sf: SourceFile): Set<string> {
  const derived = new Set<string>();
  for (const el of namedArrayLiteral(sf, "DERIVED_ASSET_COLUMNS")?.getElements() ?? []) {
    if (el.isKind(SyntaxKind.StringLiteral)) {
      derived.add(el.getLiteralText());
    }
  }
  return derived;
}

function parseRegistry(sf: SourceFile): { retaining: Set<string>; derived: Set<string> } {
  return { retaining: collectRetaining(sf), derived: collectDerived(sf) };
}

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

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
        "packages/db/src/schema/assets.ts": 'export const assets = sqliteTable("assets", { id: text("id").primaryKey() });\n',
        "packages/server/src/domain/assets/persistence/asset-refs.ts": "export const ASSET_REFS = [];\nexport const DERIVED_ASSET_COLUMNS = [];\n",
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
        "packages/db/src/schema/assets.ts": 'export const assets = sqliteTable("assets", { id: text("id").primaryKey() });\n',
        "packages/server/src/domain/assets/persistence/asset-refs.ts":
          "export const ASSET_REFS = [{ table: t, column: t.assetId }];\nexport const DERIVED_ASSET_COLUMNS: string[] = [];\n",
      },
      why: "the FK column is classified RETAINING in ASSET_REFS — a covered column, passes",
    },
    {
      files: {
        "packages/db/src/schema/x.ts":
          'import { assets } from "./assets";\nexport const t = sqliteTable("thing", {\n  assetId: text("asset_id").references(() => assets.id),\n});\n',
        "packages/db/src/schema/assets.ts": 'export const assets = sqliteTable("assets", { id: text("id").primaryKey() });\n',
        "packages/server/src/domain/assets/persistence/asset-refs.ts":
          'export const ASSET_REFS = [];\nexport const DERIVED_ASSET_COLUMNS = ["thing.asset_id"];\n',
      },
      why: "the FK column is classified DERIVED in DERIVED_ASSET_COLUMNS (the image_embeddings precedent) — passes",
    },
    {
      files: {
        "packages/db/src/schema/x.ts":
          'import { assets } from "./assets";\nexport const t = sqliteTable("thing", {\n  assetId: text("asset_id").references(() => assets.id),\n});\n',
        "packages/db/src/schema/assets.ts": 'export const assets = sqliteTable("assets", { id: text("id").primaryKey() });\n',
      },
      why: "vacuous: the asset-refs registry file isn't in the project — nothing to reconcile against, passes",
    },
    {
      // a schema column with no FK to assets.id is not an asset ref — ignored.
      files: {
        "packages/db/src/schema/x.ts": 'export const t = sqliteTable("thing", { id: text("id").primaryKey() });\n',
        "packages/server/src/domain/assets/persistence/asset-refs.ts": "export const ASSET_REFS = [];\nexport const DERIVED_ASSET_COLUMNS: string[] = [];\n",
      },
      why: "a schema column with no FK to assets.id is not an asset ref — ignored, passes",
    },
  ],
};
