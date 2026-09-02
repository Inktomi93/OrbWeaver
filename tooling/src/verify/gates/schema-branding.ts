// Gate: schema-branding — the Drizzle-column companion to the no-raw-id grit. Every entity id column
// in packages/db/src/schema/ must carry a `.$type<XId>()` brand so the TypeID discipline can't rot when
// a new table/FK is added unbranded. Two checks, generic (no hardcoded table list): unbranded-id-pk (a
// `text(...).primaryKey()` column named `id` with no `.$type<>()`) and unbranded-fk (a `.references()`
// FK with no brand where the target's own id IS branded). Escape: `// plain-id: <reason>`.

// COLUMNS ARE RESOLVED, NOT REQUIRED INLINE (#945): the columns argument is read through
// `_shared/schema-read.ts`, which follows an imported/aliased object-literal binding (and object spreads)
// and refuses loudly on any other shape. `sqliteTable("x", importedColumns, …)` used to yield ZERO columns
// here, erasing this gate's obligations while the schema file scan stayed healthy; findings anchor on the
// column's DECLARING file and the scan line prints the resolved table/column population.
import type { SchemaColumn } from "@orb/tooling/_shared/schema-read";
import { columnProperties, schemaScan } from "@orb/tooling/_shared/schema-read";
import type { CallExpression, Project } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";
import type { Violation } from "../contract/harness.ts";

const SCHEMA_DIR = "/packages/db/src/schema/";
const REF_RE = /references\(\s*\([^)]*\)[^=]*=>\s*([A-Za-z_$][\w$]*)\.id\b/u;
const PLAIN_ID_RE = /\/\/\s*plain-id:/u;

interface Column {
  readonly table: string;
  readonly constName: string;
  readonly prop: string;
  readonly hasType: boolean;
  readonly isPk: boolean;
  readonly refTarget: string | undefined;
  readonly plainMarked: boolean;
  readonly file: string;
  readonly line: number;
}

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

function toColumn(column: SchemaColumn, table: string, constName: string, file: string): Column | undefined {
  const chain = column.text;
  if (!chain.startsWith("text(")) {
    return;
  }
  const leading = column.node
    .getLeadingCommentRanges()
    .map((c) => c.getText())
    .join("\n");
  return {
    table,
    constName,
    prop: column.name,
    hasType: chain.includes(".$type<"),
    isPk: chain.includes(".primaryKey("),
    refTarget: chain.match(REF_RE)?.[1],
    plainMarked: PLAIN_ID_RE.test(leading),
    file,
    line: column.node.getStartLineNumber(),
  };
}

function columnsFromTable(call: CallExpression, root: string): Column[] {
  const [nameArg, colsArg] = call.getArguments();
  const table = nameArg?.asKind(SyntaxKind.StringLiteral)?.getLiteralValue() ?? "?";
  if (colsArg === undefined) {
    return [];
  }
  const constName = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName() ?? table;
  const out: Column[] = [];
  for (const column of columnProperties(colsArg)) {
    // The DECLARING file, which differs from the table's once the columns object is imported (#945) or the
    // member is a SHORTHAND pointing at a const one hop away (#1035).
    const col = toColumn(column, table, constName, relPath(root, column.node.getSourceFile().getFilePath()));
    if (col !== undefined) {
      out.push(col);
    }
  }
  return out;
}

function collectColumns(root: string, project: Project): Column[] {
  const columns: Column[] = [];
  for (const sf of project.getSourceFiles()) {
    const path = sf.getFilePath();
    if (!path.includes(SCHEMA_DIR)) {
      continue;
    }
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if (call.getExpression().getText() === "sqliteTable") {
        columns.push(...columnsFromTable(call, root));
      }
    }
  }
  return columns;
}

/** The whole-tree branding reconciliation shared by the legacy Check and the single-pass `run` descriptor:
 *  collect every schema column, build the branded-id map, then judge (unbranded pk-id / unbranded FK to a
 *  branded target). */
function reconcileSchemaBranding(root: string, project: Project): Violation[] {
  const columns = collectColumns(root, project);
  const brandedTableId = new Map<string, boolean>();
  for (const c of columns) {
    if (c.prop === "id") {
      brandedTableId.set(c.constName, c.hasType);
    }
  }
  const violations: Violation[] = [];
  for (const c of columns) {
    if (c.hasType || c.plainMarked) {
      continue;
    }
    if (c.prop === "id" && c.isPk) {
      violations.push({
        file: c.file,
        line: c.line,
        message: `${c.table}.id is a primary-key id with no .$type<…>() brand — brand it (define the id in @orb/kit/ids + ID_PREFIX, then .$type<XId>()), or mark it with a leading // plain-id: <reason>.`,
      });
      continue;
    }
    if (c.refTarget !== undefined && brandedTableId.get(c.refTarget) === true) {
      violations.push({
        file: c.file,
        line: c.line,
        message: `${c.table}.${c.prop} is a FK to branded ${c.refTarget}.id but unbranded — the brand must flow across the FK. Add .$type<…Id>() (the target's brand, from @orb/kit/ids), or // plain-id: <reason>.`,
      });
    }
  }
  return violations;
}

// schema-branding is a whole-tree reconciliation: collect every schema id/FK column, build the
// branded-id-per-table map, then judge (a pk `id` with no .$type<> brand; a FK to a BRANDED target's id
// that is itself unbranded — the brand must flow across the FK). The escape hatch is a `// plain-id:`
// comment (per column).
export const gate: GateDescriptor = {
  name: "schema-branding",
  docRow: "TypeID discipline (no-raw-id grit companion; @orb/kit/ids)",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "an entity id column carries no `.$type<XId>()` brand (a pk `id`, or an unbranded FK to a branded target — the brand must flow across the FK) — brand it via @orb/kit/ids, or mark it with a leading `// plain-id: <reason>`.",
  fix: "define the id in @orb/kit/ids + ID_PREFIX and add `.$type<XId>()`, or annotate a deliberately-plain id with a leading `// plain-id: <reason>` comment.",
  run: (ctx) => {
    ctx.scan(schemaScan(ctx.project));
    for (const v of reconcileSchemaBranding(ctx.root, ctx.project)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: 'const id = text("id").primaryKey();\nexport const t = sqliteTable("t", { id });\n',
      at: "packages/db/src/schema/x.ts",
      expect: { count: 1, messageIncludes: "primary-key id with no" },
      why: "THE #1035 SHORTHAND RED: an unbranded primary-key id written as a shorthand member produced ZERO Column records, so the branding judgement had nothing to judge",
    },
    {
      files: {
        "packages/db/src/schema/x-columns.ts": 'export const tColumns = { id: text("id").primaryKey() };\n',
        "packages/db/src/schema/x.ts": 'import { tColumns } from "./x-columns";\nexport const t = sqliteTable("t", tColumns);\n',
      },
      expect: { count: 1, messageIncludes: "primary-key id with no" },
      why: "THE #945 IMPORTED-COLUMNS RED, leg 1: an unbranded primary-key id behind an imported columns object produced ZERO Column records, so the whole branding judgement had nothing to judge",
    },
    {
      files: {
        "packages/db/src/schema/child-columns.ts": 'export const childColumns = { parentId: text("parent_id").references(() => parent.id) };\n',
        "packages/db/src/schema/x.ts":
          'import { childColumns } from "./child-columns";\nexport const parent = sqliteTable("parent", { id: text("id").primaryKey().$type<ParentId>() });\nexport const child = sqliteTable("child", childColumns);\n',
      },
      expect: { count: 1, messageIncludes: "unbranded" },
      why: "THE #945 IMPORTED-COLUMNS RED, leg 2 (the OPPOSITE leg the audit names): an unbranded FK to a BRANDED target, imported — the brand must flow across the FK whichever file the column is declared in",
    },
    {
      files: 'export const t = sqliteTable("t", { id: text("id").primaryKey() });\n',
      at: "packages/db/src/schema/x.ts",
      expect: { messageIncludes: "no .$type" },
      why: "a primary-key id column with no .$type<> brand — the TypeID discipline it enforces",
    },
    {
      files:
        'export const parent = sqliteTable("parent", { id: text("id").primaryKey().$type<ParentId>() });\nexport const child = sqliteTable("child", { parentId: text("parent_id").references(() => parent.id) });\n',
      at: "packages/db/src/schema/fk.ts",
      expect: { messageIncludes: "FK to branded" },
      why: "an unbranded FK to a BRANDED target's id — the brand-must-flow-across-the-FK arm (cross-file lookup, distinct message)",
    },
  ],
  mustPass: [
    {
      files: 'const id = text("id").primaryKey().$type<TId>();\nexport const t = sqliteTable("t", { id });\n',
      at: "packages/db/src/schema/x.ts",
      why: "the SHORTHAND's green twin: the resolved column carries its brand — passes",
    },
    {
      files: 'export const t = sqliteTable("t", { id: text("id").primaryKey().$type<TId>() });\n',
      at: "packages/db/src/schema/y.ts",
      why: "a branded pk id (`.$type<TId>()`) — the sanctioned shape, passes",
    },
    {
      files: 'export const t = sqliteTable("t", {\n  // plain-id: intentionally plain, not a TypeID entity\n  id: text("id").primaryKey(),\n});\n',
      at: "packages/db/src/schema/plain.ts",
      why: "an unbranded pk id marked with a leading // plain-id: comment — the escape hatch, passes",
    },
    {
      files:
        'export const parent = sqliteTable("parent", {\n  // plain-id: deliberately plain target\n  id: text("id").primaryKey(),\n});\nexport const child = sqliteTable("child", { parentId: text("parent_id").references(() => parent.id) });\n',
      at: "packages/db/src/schema/plainfk.ts",
      why: "an unbranded FK to a PLAIN (unbranded, plain-id-marked) target — brandedTableId is false so the FK auto-exempts, passes",
    },
  ],
};
