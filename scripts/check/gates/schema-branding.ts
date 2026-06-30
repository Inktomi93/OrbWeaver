// Gate: schema-branding — the Drizzle-column companion to the no-raw-id grit. Every entity id column
// in packages/db/src/schema/ must carry a `.$type<XId>()` brand so the TypeID discipline can't rot
// when a new table/FK is added unbranded. Generic (no hardcoded table list):
//   1. unbranded-id-pk — a `text(...).primaryKey()` column named `id` with no `.$type<>()`.
//   2. unbranded-fk    — a `.references(() => X.id)` FK with no `.$type<>()` where X's OWN id IS branded
//                        (can't brand an FK tighter than its target — plain-target FKs auto-exempt).
// Escape hatch: a leading `// plain-id: <reason>` comment marks a deliberately-plain id.

import type { CallExpression, Project, PropertyAssignment } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

const SCHEMA_DIR = "/packages/db/src/schema/";
const REF_RE = /references\(\s*\([^)]*\)[^=]*=>\s*([A-Za-z_$][\w$]*)\.id\b/u;
const PLAIN_ID_RE = /\/\/\s*plain-id:/u;

type Column = {
  readonly table: string;
  readonly constName: string;
  readonly prop: string;
  readonly hasType: boolean;
  readonly isPk: boolean;
  readonly refTarget: string | undefined;
  readonly plainMarked: boolean;
  readonly file: string;
  readonly line: number;
};

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

function toColumn(
  pa: PropertyAssignment,
  table: string,
  constName: string,
  file: string,
): Column | undefined {
  const init = pa.getInitializer();
  if (init === undefined) {
    return;
  }
  const chain = init.getText();
  if (!chain.startsWith("text(")) {
    return;
  }
  const leading = pa
    .getLeadingCommentRanges()
    .map((c) => c.getText())
    .join("\n");
  return {
    table,
    constName,
    prop: pa.getName(),
    hasType: chain.includes(".$type<"),
    isPk: chain.includes(".primaryKey("),
    refTarget: chain.match(REF_RE)?.[1],
    plainMarked: PLAIN_ID_RE.test(leading),
    file,
    line: pa.getStartLineNumber(),
  };
}

function columnsFromTable(call: CallExpression, file: string): Column[] {
  const [nameArg, colsArg] = call.getArguments();
  const table = nameArg?.asKind(SyntaxKind.StringLiteral)?.getLiteralValue() ?? "?";
  const cols = colsArg?.asKind(SyntaxKind.ObjectLiteralExpression);
  if (cols === undefined) {
    return [];
  }
  const constName = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName() ?? table;
  const out: Column[] = [];
  for (const pa of cols.getProperties()) {
    if (!Node.isPropertyAssignment(pa)) {
      continue;
    }
    const col = toColumn(pa, table, constName, file);
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
    const file = relPath(root, path);
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if (call.getExpression().getText() === "sqliteTable") {
        columns.push(...columnsFromTable(call, file));
      }
    }
  }
  return columns;
}

export const schemaBranding: Check = {
  name: "schema-branding",
  run: ({ root, project }): Violation[] => {
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
          message: `${c.table}.${c.prop} is a FK to branded ${c.refTarget}.id but unbranded — the brand must flow across the FK. Add .$type<…Id>() (the target's brand), or // plain-id: <reason>.`,
        });
      }
    }
    return violations;
  },
};
