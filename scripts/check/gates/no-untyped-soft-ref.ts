// Gate: no-untyped-soft-ref (D24 typed per-type FK tables + D37 the audit_logs actor→real-FK fix). A
// schema column whose JS key ends in `Id` (an entity reference) MUST carry a `.references()` FK —
// "boundaries are physics, FK-enforced" (D24). A soft ref (a `text`/`integer` id column with NO FK, kept
// coherent by a hand-rolled sweep) is banned; the ONE sanctioned exception is `audit_logs.entityId` (an
// append-only log that must OUTLIVE an arbitrary referent of unknown type — D24), plus `users.externalId`
// (an EXTERNAL IdP subject string, not an orbweaver-table reference at all). A new unlisted `*Id` column
// without a `.references()` at landing either gets its FK or a justified allowlist row with a D-cite.
//
// The allowlist is a two-direction ratchet: a stale entry (a listed pair that GAINS a `.references()` or
// vanishes) is RED too, so the exception list can't rot.
import type { Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

const SCHEMA_DIR = /\/packages\/db\/src\/schema\//u;
const TABLE_FN = "sqliteTable";
const ID_KEY = /Id$/u;
const COLUMN_ROOTS = new Set(["text", "integer"]);

/** `table.column` (JS key) pairs sanctioned to be an id-shaped column with NO FK, each with its cite. */
export const SOFT_REF_ALLOWLIST: Readonly<Record<string, string>> = {
  // The append-only audit log must outlive an arbitrary referent of unknown type — the ONE D24 soft ref.
  "audit_logs.entityId": "D24 the sole sanctioned soft-ref (append-only log, polymorphic referent)",
  // An external IdP subject identifier (the SSO `sub`), not a reference to any orbweaver table.
  "users.externalId": "external IdP subject string, not an orbweaver-table FK",
  // The Claude Agent SDK's OWN resume handle (the prompt-cache lineage id the SDK returns) — an
  // EXTERNAL identifier, not a reference to any orbweaver table (D8/D25).
  "session_entries.sdkSessionId": "external agent-sdk resume handle, not an orbweaver-table FK",
};

const SOFT_MESSAGE = (pair: string): string =>
  `column \`${pair}\` is an id-shaped column with NO \`.references()\` FK — a soft ref is banned ` +
  "(boundaries are physics, FK-enforced: D24). Add the FK, or if it is legitimately non-relational add a " +
  "justified allowlist row (scripts/check/gates/no-untyped-soft-ref.ts) with a D-cite. See " +
  "Core-Path-Registry-D1-D34.md D24.";
const STALE_MESSAGE = (pair: string): string =>
  `SOFT_REF_ALLOWLIST names "${pair}" but that column now has a \`.references()\` FK (or no longer ` +
  "exists) — delete the stale entry (scripts/check/gates/no-untyped-soft-ref.ts). See D24.";

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

/** The root callee identifier of a `text("x").a().b()` builder chain (`text`/`integer`/…). Walks the
 *  call/property-access spine down to its leading identifier. */
function chainRoot(expr: Node): string {
  let current = expr;
  while (
    current.isKind(SyntaxKind.CallExpression) ||
    current.isKind(SyntaxKind.PropertyAccessExpression)
  ) {
    current = current.getExpression();
  }
  return current.isKind(SyntaxKind.Identifier) ? current.getText() : "";
}

type IdColumn = { pair: string; line: number; hasRef: boolean };

/** Every id-shaped column (key ends `Id`, rooted at text/integer, no `.primaryKey()`) in one table. */
function idColumns(colsObj: Node, tableSqlName: string): IdColumn[] {
  if (!colsObj.isKind(SyntaxKind.ObjectLiteralExpression)) {
    return [];
  }
  const out: IdColumn[] = [];
  for (const prop of colsObj.getProperties()) {
    if (!prop.isKind(SyntaxKind.PropertyAssignment)) {
      continue;
    }
    if (!ID_KEY.test(prop.getName())) {
      continue;
    }
    const init = prop.getInitializerOrThrow();
    if (!COLUMN_ROOTS.has(chainRoot(init))) {
      continue;
    }
    const chain = init.getText();
    if (chain.includes(".primaryKey(")) {
      continue;
    }
    out.push({
      pair: `${tableSqlName}.${prop.getName()}`,
      line: prop.getStartLineNumber(),
      hasRef: chain.includes(".references("),
    });
  }
  return out;
}

/** The SQL table name (first `sqliteTable` arg) → its columns object, for every table in a file. */
function tables(sf: SourceFile): { sqlName: string; colsObj: Node }[] {
  const out: { sqlName: string; colsObj: Node }[] = [];
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (!(callee.isKind(SyntaxKind.Identifier) && callee.getText() === TABLE_FN)) {
      continue;
    }
    const [nameArg, colsArg] = call.getArguments();
    if (nameArg?.isKind(SyntaxKind.StringLiteral) && colsArg !== undefined) {
      out.push({ sqlName: nameArg.getLiteralText(), colsObj: colsArg });
    }
  }
  return out;
}

/** Soft-ref (no-FK) columns in one file: the flags + the set of pairs seen (for the stale-arm). */
function scanFile(
  sf: SourceFile,
  rel: string,
  allowlist: Readonly<Record<string, string>>,
): { violations: Violation[]; softPairs: string[] } {
  const violations: Violation[] = [];
  const softPairs: string[] = [];
  for (const table of tables(sf)) {
    for (const col of idColumns(table.colsObj, table.sqlName)) {
      if (col.hasRef) {
        continue;
      }
      softPairs.push(col.pair);
      if (!(col.pair in allowlist)) {
        violations.push({ file: rel, line: col.line, message: SOFT_MESSAGE(col.pair) });
      }
    }
  }
  return { violations, softPairs };
}

export function createNoUntypedSoftRef(allowlist: Readonly<Record<string, string>>): Check {
  return {
    name: "no-untyped-soft-ref",
    run: ({ root, project }): Violation[] => {
      const violations: Violation[] = [];
      const softPairs = new Set<string>();
      let sawSchema = false;
      for (const sf of project.getSourceFiles()) {
        if (!SCHEMA_DIR.test(sf.getFilePath())) {
          continue;
        }
        sawSchema = true;
        const res = scanFile(sf, relPath(root, sf.getFilePath()), allowlist);
        violations.push(...res.violations);
        for (const p of res.softPairs) {
          softPairs.add(p);
        }
      }
      if (!sawSchema) {
        return violations; // placeholder tree — vacuous
      }
      for (const pair of Object.keys(allowlist)) {
        if (!softPairs.has(pair)) {
          violations.push({
            file: "packages/db/src/schema",
            line: 0,
            message: STALE_MESSAGE(pair),
          });
        }
      }
      return violations;
    },
  };
}

export const noUntypedSoftRef: Check = createNoUntypedSoftRef(SOFT_REF_ALLOWLIST);
