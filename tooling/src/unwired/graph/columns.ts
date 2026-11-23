// `pnpm unwired columns` as a query over the graph session: every Drizzle column in packages/db/src/schema/ and the
// columns production never reads, never writes, or neither. The graph judges each column's declaration, so a select
// site, a filter and a read of a row's member all count; no column is matched by its name.
//
// - The schema files are the session's declaring home (`BuildSession.declaringHomes`): a table definition declares its
//   columns, and its index, foreign-key and primary-key callbacks neither read nor write them. The migrations and the
//   baseline are SQL no program holds.
// - A select with no column list reads a column only where production reads the row's member: directly, or through the
//   declared shape the row is handed to, whose member read the row member's flow carries to the column (flows.ts).
// - A zod parse of the row, `schema.parse({ ...row })`, reads the columns whose names its output carries (build.ts).
// - A Drizzle store writes a stored literal's keys, and a whole value's required members; an optional member is written
//   where the value that sets it is built (build.ts, the plan's "Columns nothing reads or writes").
// - A whole-row dump into a log reads nothing; a row serialized into a file, as an export writes it, reads every column
//   it carries.
// - A primary-key column production never reads is listed apart: the key is the row's identity.
// - A product reader is a product file or snap (state.ts `productReader`, D357).
import type { DeliberateEntry } from "../deliberate.ts";
import { sortRows } from "../deliberate.ts";
import { DB_SCHEMA, schemaTables } from "../drizzle-rows.ts";
import type { JudgedEntry, JudgedSplit } from "../judged.ts";
import type { NativeWorld, PropertyName } from "../native.ts";
import { isProduction } from "../worlds.ts";
import { settleRoles } from "./analyse.ts";
import type { Graph } from "./build.ts";
import type { DeclKey } from "./resolve.ts";
import { READS } from "./roles.ts";
import type { MemberRoles, RoleSite } from "./state.ts";
import { productReader } from "./state.ts";

/** The schema directory, as the session's site-keeping and declaring home. */
export const COLUMN_HOMES = [DB_SCHEMA] as const;

const COLUMN_KINDS = ["never-read", "never-written", "unreferenced"] as const;
/** `never-read`: production writes it and never reads it. `never-written`: production reads it and never writes it, so
 *  every read sees its default. `unreferenced`: production neither reads nor writes it. */
type ColumnKind = (typeof COLUMN_KINDS)[number];

// Enough sites to open the column's uses from the report.
const SAMPLE = 3;

/** One column with the production sites that name it as a read or a write, and how many other sites name it. A read a
 *  flow carries to the column (a shape member read off a handed row) has no site here; its verdict still counts it. */
interface ColumnCount {
  readonly key: string;
  readonly reads: number;
  readonly writes: number;
  readonly tests: number;
}

interface UnwiredColumn extends ColumnCount {
  readonly file: string;
  readonly line: number;
  /** The name the table is bound to. */
  readonly home: string;
  readonly member: string;
  readonly kind: ColumnKind;
  /** Up to a few production sites that read or write it, `file:line`. */
  readonly sample: readonly string[];
}

export interface ColumnsReport {
  readonly scanned: number;
  readonly unwired: readonly UnwiredColumn[];
  /** Primary-key columns production never reads: the key is the row's identity, which an upsert on a natural key never
   *  selects. Reported apart, never judged dead. */
  readonly primaryKeys: readonly UnwiredColumn[];
  readonly deliberate: readonly (UnwiredColumn & { readonly reason: string })[];
  /** Rows a board item owns, with the item. */
  readonly judged: JudgedSplit<UnwiredColumn>["judged"];
  /** Judged entries whose row no longer reports or whose item is no longer open. */
  readonly staleJudged: JudgedSplit<UnwiredColumn>["staleJudged"];
  /** Every column with its counts, reported or not. */
  readonly columns: readonly ColumnCount[];
  /** Production reads the graph placed on no declaration whose name is a column's, `file:line name`. The name only picks
   *  what a person reads next; it credits nothing. */
  readonly unresolved: readonly string[];
  readonly limits: readonly string[];
}

/** The repository and the deliberate and judged lists. */
export interface ColumnsOptions {
  readonly root: string;
  readonly deliberate: readonly DeliberateEntry[];
  readonly judged?: readonly JudgedEntry[] | undefined;
}

const COLUMN_LIMITS: readonly string[] = [
  "A row whose members are a subset of its table's columns, outside a mapped type over the row, matches no table by its column names; a read of a member of it named as a column is listed as unresolved.",
  "A column named only inside raw SQL text, not through a table expression, is no site; a column only raw SQL writes is listed as deliberate with its reason.",
  "A value a library reads by reflection outside the tree is followed only as far as the graph's sends follow it.",
];

interface Column {
  readonly key: string;
  readonly decl: DeclKey;
  readonly name: PropertyName;
  readonly home: string;
  /** Whether the table's primary key names it. */
  readonly primaryKey: boolean;
}

// Each column's declaration is its property assignment in the table definition, keyed as the graph keys it.
function columnsOf(world: NativeWorld): readonly Column[] {
  return schemaTables(world).flatMap(({ binding, columns, primaryKeys }) =>
    columns.map((name): Column => {
      const { file } = world.siteOf(name);
      const { parent } = name;
      return {
        key: `${file}:${binding}.${name.text}`,
        decl: `${file}#${parent.pos}-${parent.end}.${parent.kind}`,
        name,
        home: binding,
        primaryKey: primaryKeys.has(name.text),
      };
    }),
  );
}

function kindOf(roles: MemberRoles | undefined): ColumnKind | null {
  const read = [...(roles?.product ?? [])].some((role) => READS.has(role));
  const written = roles?.product.has("write") === true;
  if (read) {
    return written ? null : "never-written";
  }
  return written ? "never-read" : "unreferenced";
}

// The 1-based line a role site's position falls on, past the leading whitespace a node's position includes.
function lineAt(world: NativeWorld, file: string, at: number): number {
  const source = world.source(file);
  if (source === undefined) {
    return 0;
  }
  const start = at + (/^\s*/u.exec(source.text.slice(at))?.[0].length ?? 0);
  return source.getLineAndCharacterOfPosition(start).line + 1;
}

/** The column query over a built graph and its world. */
export function columnsPass(graph: Graph, world: NativeWorld, options: ColumnsOptions): ColumnsReport {
  const roles = settleRoles(graph);
  const located = ({ file, at }: RoleSite): string => `${file}:${String(lineAt(world, file, at))}`;
  const counts: ColumnCount[] = [];
  const findings: UnwiredColumn[] = [];
  const primaryKeys: UnwiredColumn[] = [];
  const columns = columnsOf(world);
  for (const column of columns) {
    const sites = graph.facts.roleSites.get(column.decl) ?? [];
    const product = sites.filter(({ role, file }) => (role === "write" ? isProduction(file) : READS.has(role) && productReader(file)));
    const reads = product.filter(({ role }) => READS.has(role));
    const writes = product.filter(({ role }) => role === "write");
    const tests = sites.filter(({ role, file }) => (READS.has(role) || role === "write") && !productReader(file)).length;
    const count = { key: column.key, reads: reads.length, writes: writes.length, tests };
    counts.push(count);
    const kind = kindOf(roles.get(column.decl));
    if (kind !== null) {
      const { file, position } = world.siteOf(column.name);
      const finding = {
        ...count,
        file,
        line: lineAt(world, file, position),
        home: column.home,
        member: column.name.text,
        kind,
        sample: [...writes, ...reads].slice(0, SAMPLE).map(located),
      };
      (column.primaryKey && kind === "never-read" ? primaryKeys : findings).push(finding);
    }
  }
  const names = new Set(columns.map(({ name }) => name.text));
  const unresolved = graph.facts.lostCauses.flatMap(({ read, where }) => {
    const name = read.slice(read.lastIndexOf(" .") + 2);
    return names.has(name) && isProduction(where.slice(0, where.lastIndexOf(":"))) ? [`${where} ${name}`] : [];
  });
  return {
    scanned: columns.length,
    ...sortRows(findings, options),
    primaryKeys,
    columns: counts,
    unresolved: [...new Set(unresolved)],
    limits: COLUMN_LIMITS,
  };
}
