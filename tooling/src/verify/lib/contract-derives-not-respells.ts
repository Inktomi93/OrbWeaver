// The SHARED READER for `contract-derives-not-respells` (#2091, owner decision #2096): the drizzle table
// vocabulary, the hand-written-shape reader and the `*Row`/`*Insert` → table name match.
//
// WHY IT IS HERE AND NOT IN A GATE MODULE. It was carved out while this was a two-member family — the
// `ordinary` occurrence policy and a `hard` `-health` tripwire over the gate-local ALLOWLIST — because the
// health sibling reached the predicate by importing the occurrence GATE MODULE. A `v-unaudited-finals`
// audit called that out (§5b.4 asks for "a real shared `lib/` reader (module + function, named in the
// header)") and the owner ruled the general case on 2026-09-12: **a gate module NEVER imports another gate
// module; a shared predicate moves to `lib/<family>.ts`.** The reader stays here after the family
// collapsed to a singleton (#2176 Phase F): a gate owns no private reader either, and the three functions
// below are the policy's whole computation, not a spelling of its `create`.
//
// THE ALLOWLIST IS GONE — ITS TWO ROWS ARE CENTRAL REVIEWED GRANTS (#1922/#2176 Phase F, 2026-09-15).
// `contract-derives-not-respells` is `authority: "reviewed-grant"`; each formerly-exempt homonym/aggregate
// is a `(policyId, subject, operation)` row in `lib/reviewed-grants.ts` whose subject is the identical
// `<file>::<ShapeName>` key the table used. The two-sided staleness ratchet the `-health` sibling owned is
// now the central engine's: a granted row nobody consumes raises `stale-reviewed-grant`, and an ungranted
// hand-row is a finding. A gate receives no exemption table, so `ExemptionTable` no longer reaches here.
import type { Node, SourceFile } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";

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
  const out: ContractShape[] = [];
  for (const i of sf.getInterfaces()) {
    if (i.isExported()) {
      out.push({ name: i.getName(), node: i });
    }
  }
  for (const t of sf.getTypeAliases()) {
    if (t.isExported() && t.getTypeNode()?.getKind() === SyntaxKind.TypeLiteral) {
      out.push({ name: t.getName(), node: t });
    }
  }
  return out;
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
