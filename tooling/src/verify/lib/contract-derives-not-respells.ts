// The SHARED READER for the `contract-derives-not-respells` family (#2091, owner decision #2096): the
// drizzle table vocabulary, the hand-written-shape reader, the `*Row`/`*Insert` → table name match, and the
// ARM-B ALLOWLIST the two policies judge together.
//
// WHY IT IS HERE AND NOT IN A GATE MODULE. Both halves of this family need the identical computation — the
// `ordinary` occurrence policy reads the allowlist to SKIP a report, and the `hard` `-health` tripwire
// re-derives the same table match to prove each row is still EARNED — and the health sibling used to reach
// them by importing the occurrence gate module directly. A `v-unaudited-finals` audit called that out
// (§5b.4 asks for "a real shared `lib/` reader (module + function, named in the header)") and the owner
// ruled the general case on 2026-09-12: **a gate module NEVER imports another gate module; a shared
// predicate moves to `lib/<family>.ts`.** This file is that home. A gate module is a POLICY — one
// descriptor, one verdict — and a second policy importing it takes a dependency on somebody else's
// enforcement surface, so a change made for one arm silently re-aims the other.
//
// THE ALLOWLIST IS DATA, AND IT IS RATCHETED FROM OUTSIDE. Every row exempts an exact `<file>::<ShapeName>`
// pair because it is a homonym or a read-time aggregate; the claim is that the shape STILL matches a table
// name today. `contract-derives-not-respells-health` reds any row whose shape was renamed or deleted, or
// whose matching table disappeared. Adding a row here is therefore not a way to park debt — it is a claim
// the tripwire keeps checking.
import type { Node, SourceFile } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import type { ExemptionTable } from "../contract/gate.ts";

export const DOMAIN_CONTRACT_RE = /^packages\/server\/src\/domain\/(?<domain>[^/]+)\/contract\//u;
export const DB_SCHEMA_DIR = "packages/db/src/schema/";
const ROW_SUFFIX_RE = /(?<suffix>Row|Insert)$/u;
const SQLITE_TABLE = "sqliteTable";

/** ARM B survivors: a `*Row` whose prefix collides with a table NAME but which is not that table's row. Each
 *  row states WHY (a homonym or an aggregate), and the ratchet works both ways — a row whose file no longer
 *  carries the shape is RED, so a cleaned-up exemption cannot linger. */
export const ALLOWLIST: ExemptionTable = {
  "packages/server/src/domain/discovery/contract/results.ts::ThemeRow": {
    why: "HOMONYM: discovery's `ThemeRow` is an emergent THEME CLUSTER (k-means over digest embeddings — id/level/clusterIdx/size/model), while the `themes` table is the UI palette/token-override row (owner-scoped `override` blob). Same word, unrelated concepts; the cluster's own table is `themeClusters`.",
  },
  "packages/server/src/domain/stats/contract/views.ts::ModelStatRow": {
    why: "AGGREGATE: a read-time GROUP BY projection over `model_stats` carrying computed fields that are never columns (`charactersUsedWith` — model_stats is character-less, plus the p50/p90 percentiles the file header says are computed on read, invariant #6). Deriving it from `$inferSelect` would be a lie about what the read returns.",
  },
};

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
