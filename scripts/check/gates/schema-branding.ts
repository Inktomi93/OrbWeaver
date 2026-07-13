// biome-ignore-all lint/security/noSecrets: the mustFlag/mustPass example strings are drizzle schema
// fixture snippets (sqliteTable(...) calls), not secrets.
// Gate: schema-branding — the Drizzle-column companion to the no-raw-id grit. Every entity id column
// in packages/db/src/schema/ must carry a `.$type<XId>()` brand so the TypeID discipline can't rot
// when a new table/FK is added unbranded. Generic (no hardcoded table list):
//   1. unbranded-id-pk — a `text(...).primaryKey()` column named `id` with no `.$type<>()`.
//   2. unbranded-fk    — a `.references(() => X.id)` FK with no `.$type<>()` where X's OWN id IS branded
//                        (can't brand an FK tighter than its target — plain-target FKs auto-exempt).
// Escape hatch: a leading `// plain-id: <reason>` comment marks a deliberately-plain id.

import type { CallExpression, Project, PropertyAssignment } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

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

// ── SINGLE-PASS CONTRACT FORM (§1.2, §8.1 (c) — a whole-project RECONCILIATION via `run`) ──────────
// schema-branding is a whole-tree reconciliation: collect every schema id/FK column, build the
// branded-id-per-table map, then judge (a pk `id` with no .$type<> brand; a FK to a BRANDED target's id
// that is itself unbranded — the brand must flow across the FK). The cross-file brand lookup makes it a
// `run` reconciliation, not a per-node predicate. No live allowlist → no fileLoaded sentinel; the escape
// hatch is a `// plain-id:` comment (per column). Findings byte-identical to the legacy Check. Kept
// ALONGSIDE the legacy Check.
export const gate: GateDescriptor = {
  name: "schema-branding",
  docRow: "TypeID discipline (no-raw-id grit companion; @orb/kit/ids)",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "an entity id column carries no `.$type<XId>()` brand (a pk `id`, or an unbranded FK to a branded target — the brand must flow across the FK) — brand it via @orb/kit/ids, or mark it with a leading `// plain-id: <reason>`.",
  fix: "define the id in @orb/kit/ids + ID_PREFIX and add `.$type<XId>()`, or annotate a deliberately-plain id with a leading `// plain-id: <reason>` comment.",
  run: (ctx) => {
    for (const v of reconcileSchemaBranding(ctx.root, ctx.project)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: 'export const t = sqliteTable("t", { id: text("id").primaryKey() });\n',
      at: "packages/db/src/schema/x.ts",
      expect: { messageIncludes: "no .$type" },
      why: "a primary-key id column with no .$type<> brand — the TypeID discipline it enforces",
    },
  ],
  mustPass: [
    {
      files: 'export const t = sqliteTable("t", { id: text("id").primaryKey().$type<TId>() });\n',
      at: "packages/db/src/schema/y.ts",
      why: "a branded pk id (`.$type<TId>()`) — the sanctioned shape, passes",
    },
  ],
};
