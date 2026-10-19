// The reader behind `tests/tooling/verify/ops/contract-derives-native.test.ts` and `contract-structural-copy`: the drizzle table
// vocabulary, the hand-written-shape reader, the `*Row`/`*Insert` -> table name match and the domain contract home. A domain
// `contract/` derives its shapes and never re-spells one `@orb/contracts` or `db` owns.
import type { Node, SourceFile } from "ts-morph";
import { Node as N } from "ts-morph";
import { handWrittenShapeDeclarations } from "../../floor/code-facts/shape-declaration.ts";

export const DOMAIN_CONTRACT_RE = /^packages\/server\/src\/domain\/(?<domain>[^/]+)\/contract\//u;

const DB_SCHEMA_DIR = "packages/db/src/schema/";
const ROW_SUFFIX_RE = /(?<suffix>Row|Insert)$/u;
const SQLITE_TABLE = "sqliteTable";

export interface ContractShape {
  readonly name: string;
  readonly node: Node;
}

/** Every drizzle table's EXPORT name (`export const workloadSchedules = sqliteTable(…)`). */
export function tableNames(files: readonly SourceFile[], relativePath: (sourceFile: SourceFile) => string): Set<string> {
  const names = new Set<string>();
  for (const sf of files) {
    if (!relativePath(sf).startsWith(DB_SCHEMA_DIR)) {
      continue;
    }
    for (const v of sf.getVariableDeclarations()) {
      const init = v.getInitializer();
      if (init !== undefined && N.isCallExpression(init) && init.getExpression().getText() === SQLITE_TABLE) {
        names.add(v.getName());
      }
    }
  }
  return names;
}

/** The HAND-WRITTEN exported shapes of one file: every exported interface, and every exported type alias whose
 *  right-hand side is an object literal type. A type alias that REFERENCES another type (the derive) is
 *  deliberately absent — that is the shape the family wants. */
export function handWrittenShapes(sf: SourceFile): ContractShape[] {
  return handWrittenShapeDeclarations(sf).map((node) => ({ name: node.getName(), node }));
}

/** The table this `*Row`/`*Insert` name claims, if any: `WorkloadScheduleRow` → `workloadSchedules`. */
export function matchedTable(name: string, tables: ReadonlySet<string>): { table: string; suffix: string } | undefined {
  const suffix = ROW_SUFFIX_RE.exec(name)?.groups?.["suffix"];
  if (suffix === undefined) {
    return;
  }
  const bare = name.slice(0, -suffix.length);
  const camel = bare.charAt(0).toLowerCase() + bare.slice(1);
  const table = [camel, `${camel}s`, `${camel}es`].find((candidate) => tables.has(candidate));
  return table === undefined ? undefined : { table, suffix };
}
