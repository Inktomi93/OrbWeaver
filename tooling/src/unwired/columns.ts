// `pnpm unwired columns`: every Drizzle column in packages/db/src/schema/ with its production read and write sites, and
// the columns production never reads, never writes, or neither. Engine one's reference index judges each column's
// declaration, so a select site, a filter and a read of a row's member all count; no column is matched by its name.
//
// A select with no column list reads a column only where production reads the row's member, directly or through the
// shape the row is handed to (./drizzle-rows.ts). A whole-row dump into a log reads nothing; a row serialized into a file,
// as an export writes it, reads every column it carries. A store of a whole value writes its required members' columns;
// an optional one counts only where the value's construction sets it. Sites in the schema files are neither read nor
// write, and the migrations and the baseline are SQL no program holds.
import type { Site } from "./classify.ts";
import { isProductionFile, Sources, siteKey } from "./classify.ts";
import { DB_SCHEMA, schemaTables } from "./drizzle-rows.ts";
import type { Roles } from "./fields.ts";
import { rolesOf } from "./fields.ts";
import { declarationKeys, homeFiles, NativeWorld } from "./native.ts";
import type { PropertyFacts, PropertyReferences } from "./occurrences.ts";
import { joinFacts, propertyFacts } from "./occurrences.ts";
import type { ScanOptions } from "./scan.ts";
import { scanWorlds, sitesOf, sortDeliberate } from "./scan.ts";

const COLUMN_KINDS = ["never-read", "never-written", "unreferenced"] as const;
/** `never-read`: production writes it and never reads it. `never-written`: production reads it and never writes it, so
 *  every read sees its default. `unreferenced`: production neither reads nor writes it. */
type ColumnKind = (typeof COLUMN_KINDS)[number];

// Enough sites to open the column's uses from the report.
const SAMPLE = 3;

/** One column with its production read and write counts and how many test sites name it. */
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
  readonly deliberate: readonly (UnwiredColumn & { readonly reason: string })[];
  /** Engine one alone judges columns, so no audit disagrees. */
  readonly disagreements: readonly never[];
  /** Every column with its counts, reported or not. */
  readonly columns: readonly ColumnCount[];
  /** Row members no resolver step placed whose holder's other members are declared in a schema file, `file:line name`:
   *  a read or write that could credit a column. Listed for judgement, never credited. */
  readonly unresolved: readonly string[];
  readonly limits: readonly string[];
}

const COLUMN_LIMITS: readonly string[] = [
  "A row whose members are a subset of its table's columns, as a select of a getTableColumns rest returns, matches no table by its column names; its member reads are listed as unresolved.",
  "A column named only inside raw SQL text, not through a table expression, is no site.",
  "A value a library reads by reflection outside the tree is followed only as far as the sends scan follows it.",
];

interface Column {
  readonly key: string;
  readonly keys: readonly string[];
  readonly site: Site;
  readonly home: string;
  readonly member: string;
}

// The columns of the schema files a world homes, each with its declaration keys.
function columnsOf(world: NativeWorld, home: ReadonlySet<string>): readonly Column[] {
  const tables = schemaTables(world, (file) => home.has(file));
  const names = tables.flatMap(({ columns }) => columns);
  const symbols = world.symbolsAt(names);
  let next = 0;
  return tables.flatMap(({ binding, columns }) =>
    columns.map((name): Column => {
      const symbol = symbols[next++];
      const site = world.siteOf(name);
      return { key: `${site.file}:${binding}.${name.text}`, keys: symbol === undefined ? [] : declarationKeys(symbol), site, home: binding, member: name.text };
    }),
  );
}

// A column's roles: the sites outside the schema files, and each production send of it into a file, which reads it.
function columnRoles(sources: Sources, references: PropertyReferences, column: Column): Roles {
  const sites = sitesOf(references.index, column.keys, column.site).filter((site) => !site.file.startsWith(DB_SCHEMA));
  const roles = rolesOf(sources, sites, references);
  const read = new Map(roles.read.map((site) => [siteKey(site), site]));
  for (const send of column.keys.flatMap((key) => references.sends.get(key) ?? [])) {
    if (send.destination === "file" && isProductionFile(send.site.file)) {
      read.set(siteKey(send.site), send.site);
    }
  }
  return { ...roles, read: [...read.values()] };
}

function kindOf({ read, write }: Roles): ColumnKind | null {
  if (read.length > 0) {
    return write.length > 0 ? null : "never-written";
  }
  return write.length > 0 ? "never-read" : "unreferenced";
}

/** Every column of the schema with its production reads and writes over every world of `root`. */
export function scanColumns(options: ScanOptions): ColumnsReport {
  const { worlds, testWorlds } = scanWorlds(options);
  const sources = new Sources(options.root);
  const configs = [...worlds, ...testWorlds];
  const homes = homeFiles(configs, NativeWorld.fileLists(options.root, configs));
  const facts: PropertyFacts[] = [];
  const columns = new Map<string, Column>();
  for (const config of configs) {
    using world = NativeWorld.open(options.root, config);
    const home = homes.get(config) ?? new Set<string>();
    const found = columnsOf(world, home);
    for (const column of found) {
      columns.set(column.key, columns.get(column.key) ?? column);
    }
    facts.push(propertyFacts(world, home));
    options.log(`${config}: ${found.length} columns`);
  }
  const references = joinFacts(facts);
  const located = (site: Site): string => `${site.file}:${sources.line(site)}`;
  const counts: ColumnCount[] = [];
  const findings: UnwiredColumn[] = [];
  for (const column of columns.values()) {
    const roles = columnRoles(sources, references, column);
    const count = { key: column.key, reads: roles.read.length, writes: roles.write.length, tests: roles.tests };
    counts.push(count);
    const kind = kindOf(roles);
    if (kind !== null) {
      const { site, home, member } = column;
      const sample = [...roles.write, ...roles.read].slice(0, SAMPLE).map(located);
      findings.push({ ...count, file: site.file, line: sources.line(site), home, member, kind, sample });
    }
  }
  const unresolved = references.unresolved.flatMap(({ site, name, reason, holderFiles }) =>
    reason === "synthetic" && holderFiles.some((file) => file.startsWith(DB_SCHEMA)) ? [`${located(site)} ${name}`] : [],
  );
  return {
    scanned: columns.size,
    ...sortDeliberate(findings, options.deliberate),
    disagreements: [],
    columns: counts,
    unresolved,
    limits: COLUMN_LIMITS,
  };
}
